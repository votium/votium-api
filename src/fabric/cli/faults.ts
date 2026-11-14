import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { strict as assert } from 'node:assert';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FabricError } from '../errors/fabric.error';
import { FabricModule } from '../fabric.module';
import { CandidatesService } from '../services/candidates.service';
import { ElectionsService } from '../services/elections.service';
import { VotersService } from '../services/voters.service';

// LOCAL ONLY. Stops pods of the kind cluster and always puts them back. Needs the network up (make up).
const CTX = process.env.FAULT_KUBE_CONTEXT ?? 'kind-votium-fabric';
const NS = process.env.FAULT_NAMESPACE ?? 'fabric';
if (!CTX.startsWith('kind-')) {
  console.error(
    `Refusing to run against "${CTX}": this script stops pods and is for the local kind cluster only.`,
  );
  process.exit(1);
}

// Short timeouts so that failures show up quickly. Set before the module reads its configuration.
Object.assign(process.env, {
  FABRIC_EVALUATE_TIMEOUT_MS: '4000',
  FABRIC_ENDORSE_TIMEOUT_MS: '8000',
  FABRIC_SUBMIT_TIMEOUT_MS: '8000',
  FABRIC_COMMIT_STATUS_TIMEOUT_MS: '20000',
  FABRIC_RETRY_BASE_MS: '300',
});

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), FabricModule] })
class FaultModule { }

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const hex64 = (): string => randomBytes(32).toString('hex');
const kubectl = (...args: string[]): string =>
  execFileSync('kubectl', ['--context', CTX, '-n', NS, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

const stopped = new Set<string>();
function stop(...deploys: string[]): void {
  for (const d of deploys) {
    kubectl('scale', `deploy/${d}`, '--replicas=0');
    stopped.add(d);
  }
  for (const d of deploys) {
    try {
      kubectl('wait', '--for=delete', 'pod', '-l', `app=${d}`, '--timeout=120s');
    } catch {
      /* no pods left */
    }
  }
  console.log(`       stopped: ${deploys.join(', ')}`);
}
function start(...deploys: string[]): void {
  for (const d of deploys) kubectl('scale', `deploy/${d}`, '--replicas=1');
  for (const d of deploys) {
    kubectl('rollout', 'status', `deploy/${d}`, '--timeout=300s');
    stopped.delete(d);
  }
  console.log(`       restored: ${deploys.join(', ')}`);
}
function restoreAll(): void {
  for (const d of [...stopped]) {
    try {
      start(d);
    } catch (e) {
      console.error(
        `COULD NOT RESTORE ${d}: scale it back to 1 by hand (${(e as Error).message.split('\n')[0]})`,
      );
    }
  }
}
process.on('SIGINT', () => {
  restoreAll();
  process.exit(130);
});

let failed = 0;
async function check(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`OK     ${name}`);
  } catch (e) {
    failed++;
    console.log(
      `FALLO  ${name}\n         ${(e as Error).message.split('\n').slice(0, 3).join('\n         ')}`,
    );
  }
}
async function info(name: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    console.log(`INFO   ${name}: succeeded`);
  } catch (e) {
    console.log(`INFO   ${name}: ${e instanceof FabricError ? e.code : (e as Error).message}`);
  }
}
async function rejects(promise: Promise<unknown>, ...codes: string[]): Promise<FabricError> {
  try {
    await promise;
  } catch (e) {
    assert.ok(
      e instanceof FabricError,
      `expected FabricError, got ${(e as Error)?.constructor?.name}: ${(e as Error)?.message}`,
    );
    assert.ok(codes.includes(e.code), `expected ${codes.join('|')} but got ${e.code}`);
    return e;
  }
  throw new Error(`expected ${codes.join(' | ')} but the call succeeded`);
}
async function eventually<T>(fn: () => Promise<T>, tries = 12, gapMs = 5_000): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await sleep(gapMs);
    }
  }
  throw last;
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(FaultModule, {
    logger: process.env.FAULT_VERBOSE === '1' ? ['error', 'warn'] : ['error'],
  });
  const elections = app.get(ElectionsService);
  const candidates = app.get(CandidatesService);
  const voters = app.get(VotersService);

  const E = `flt${Date.now()}`;
  const signingPublicKey = generateKeyPairSync('rsa', { modulusLength: 2048 })
    .publicKey.export({ type: 'spki', format: 'pem' })
    .toString();
  const election = (id: string) => ({
    electionId: id,
    name: 'Faults',
    startDate: new Date(Date.now() - 60_000).toISOString(),
    endDate: new Date(Date.now() + 3_600_000).toISOString(),
    signingPublicKey,
  });
  const [h1, h2, h3, h4] = [hex64(), hex64(), hex64(), hex64()];
  const warm = () =>
    eventually(async () => {
      await elections.getElection(E);
      await candidates.listCandidates(E);
      await voters.getVoterStatus({ electionId: E, voterHash: h1 });
    });

  try {
    await check('baseline: create election, candidate and voters', async () => {
      await elections.createElection(election(E));
      await candidates.registerCandidate({ electionId: E, candidateId: 'c1', name: 'Ana' });
      await voters.registerVoters({ electionId: E, voterHashes: [h1, h2] });
    });

    // 1. The peer behind the writer identity goes down
    console.log('\n== 1. Peer of the writer identity down (org1-peer1)');
    stop('org1-peer1');
    await check('reads and writes fail with FABRIC_UNAVAILABLE (after retries)', async () => {
      await rejects(elections.getElection(E), 'FABRIC_UNAVAILABLE');
      await rejects(
        candidates.registerCandidate({ electionId: E, candidateId: 'c2', name: 'Luis' }),
        'FABRIC_UNAVAILABLE',
      );
    });
    await check('the auditor profile (another org) keeps reading', async () => {
      assert.equal((await elections.getElection(E, { profile: 'auditor' })).electionId, E);
    });
    start('org1-peer1');
    const t0 = Date.now();
    await check(
      'after the restart the writer recovers (time to first successful write is measured)',
      async () => {
        await warm();
        const r = await eventually(
          () => candidates.registerCandidate({ electionId: E, candidateId: 'c2', name: 'Luis' }),
          24,
          5_000,
        );
        assert.ok(r.txId);
        const secs = Math.round((Date.now() - t0) / 1000);
        console.log(`       first successful write ${secs} s after the peer was Ready`);
        assert.ok(secs < 120, `recovery took ${secs} s`);
      },
    );
    if (failed > 0)
      throw new Error('the writer did not recover: the next cases would be meaningless');

    // 2. One organization down: the policy of 4 cannot be met
    console.log('\n== 2. Org3 peer down (elections needs the 4 organizations)');
    stop('org3-peer1');
    await sleep(30_000); // let gossip expire the peer so that discovery stops offering it
    const E2 = `${E}b`;
    await check('createElection fails (endorsement policy), and nothing is written', async () => {
      await rejects(
        elections.createElection(election(E2)),
        'FABRIC_ENDORSEMENT_FAILED',
        'FABRIC_UNAVAILABLE',
      );
    });
    await info('registerCandidate (needs only Org1 and Org2) with org3 down', () =>
      candidates.registerCandidate({ electionId: E, candidateId: 'c3', name: 'Marta' }),
    );
    start('org3-peer1');
    await check(
      'after the restart the election can be created, so the failed attempt wrote nothing',
      async () => {
        await warm();
        await eventually(() => elections.createElection(election(E2)), 6, 8_000);
      },
    );

    // 3. One orderer down: quorum intact
    console.log('\n== 3. One orderer down (4 of 5: quorum intact)');
    stop('org0-orderer5');
    await sleep(15_000);
    await check('writes keep working', async () => {
      const r = await eventually(
        () => voters.registerVoters({ electionId: E, voterHashes: [h3] }),
        4,
        8_000,
      );
      assert.equal(r.data.inserted + r.data.skipped, 1);
    });
    start('org0-orderer5');

    // 4. No quorum
    console.log('\n== 4. Three orderers down (2 of 5: no quorum)');
    stop('org0-orderer3', 'org0-orderer4', 'org0-orderer5');
    await sleep(20_000);
    await check('reads keep working (they only need the peers)', async () => {
      assert.equal((await elections.getElection(E)).electionId, E);
    });
    await check('a write ends with FABRIC_OUTCOME_UNKNOWN and carries a txId', async () => {
      const e = await rejects(
        voters.registerVoters({ electionId: E, voterHashes: [h4] }),
        'FABRIC_OUTCOME_UNKNOWN',
      );
      console.log(`       txId reported: ${e.txId ?? '(none)'}`);
      assert.equal(e.outcome, 'UNKNOWN');
    });
    start('org0-orderer3', 'org0-orderer4', 'org0-orderer5');
    await sleep(40_000);
    await check(
      'after recovery the same idempotent write succeeds and the voter is registered',
      async () => {
        const r = await eventually(
          () => voters.registerVoters({ electionId: E, voterHashes: [h4] }),
          8,
          8_000,
        );
        assert.equal(r.data.inserted + r.data.skipped, 1);
        console.log(
          `       first attempt ${r.data.inserted === 1 ? 'was NOT committed' : 'WAS committed after recovery'} (inserted=${r.data.inserted}, skipped=${r.data.skipped})`,
        );
        assert.equal(
          (await voters.getVoterStatus({ electionId: E, voterHash: h4 })).status,
          'ELIGIBLE',
        );
      },
    );
  } finally {
    restoreAll();
    await app.close();
  }

  console.log(failed === 0 ? '\nFabric faults: ALL OK' : `\nFabric faults: ${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  restoreAll();
  console.error(`\nFabric faults: ABORTED (${(err as Error).message.split('\n')[0]})`);
  process.exit(1);
});
