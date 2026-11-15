import 'reflect-metadata';
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
import { VotingService } from '../services/voting.service';

// Real network. Runs a full election lifecycle WITHOUT casting votes (CastVote needs a real blind signature).
// IT_SHOW=1 prints a sample of the main responses, to review the types against reality.

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), FabricModule] })
class ItModule {}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const hex64 = (): string => randomBytes(32).toString('hex');
const show = (label: string, value: unknown): void => {
  if (process.env.IT_SHOW === '1')
    console.log(`         ${label}: ${JSON.stringify(value).slice(0, 500)}`);
};

function has(actual: unknown, expected: Record<string, unknown>, path = ''): void {
  assert.ok(actual !== null && typeof actual === 'object', `${path || 'value'} is not an object`);
  for (const [k, v] of Object.entries(expected)) {
    const a = (actual as Record<string, unknown>)[k];
    if (v !== null && typeof v === 'object' && !Array.isArray(v))
      has(a, v as Record<string, unknown>, `${path}${k}.`);
    else assert.deepEqual(a, v, `${path}${k}`);
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
    const fe = e;
    assert.ok(codes.includes(fe.code), `expected ${codes.join('|')} but got ${fe.code}`);
    return fe;
  }
  throw new Error(`expected ${codes.join(' | ')} but the call succeeded`);
}

async function check(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`OK     ${name}`);
  } catch (e) {
    console.log(
      `FALLO  ${name}\n         ${(e as Error).message.split('\n').slice(0, 3).join('\n         ')}`,
    );
    throw e;
  }
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(ItModule, { logger: ['error', 'warn'] });
  const elections = app.get(ElectionsService);
  const candidates = app.get(CandidatesService);
  const voters = app.get(VotersService);
  const voting = app.get(VotingService);

  const E = `it${Date.now()}`;
  const windowMs = Number(process.env.IT_WINDOW_MS ?? 150_000);
  const endDate = new Date(Date.now() + windowMs);
  const signingPublicKey = generateKeyPairSync('rsa', { modulusLength: 2048 })
    .publicKey.export({ type: 'spki', format: 'pem' })
    .toString();
  const base = {
    electionId: E,
    name: 'Integration',
    startDate: new Date(Date.now() - 60_000).toISOString(),
    endDate: endDate.toISOString(),
    signingPublicKey,
  };
  const [h1, h2, hNot] = [hex64(), hex64(), hex64()];

  try {
    // ---- Elections
    await check('createElection', async () => {
      const r = await elections.createElection(base);
      assert.ok(r.txId);
      assert.ok((r.blockNumber ?? 0) > 0);
      has(r.data, { electionId: E, status: 'CREATED' });
      assert.ok(r.data.timeline.createdAt);
      show('createElection', r.data);
    });
    await check('createElection duplicate -> ALREADY_EXISTS', async () => {
      await rejects(elections.createElection(base), 'ALREADY_EXISTS');
    });
    await check('getElection (writer and auditor), listElections, NOT_FOUND', async () => {
      assert.equal((await elections.getElection(E)).electionId, E);
      assert.equal((await elections.getElection(E, { profile: 'auditor' })).status, 'CREATED');
      const all = await elections.listElections();
      assert.ok(Array.isArray(all), 'listElections is not an array');
      assert.ok(all.some((e) => e.electionId === E));
      show('listElections[0]', all[0]);
      await rejects(elections.getElection('no-existe'), 'NOT_FOUND');
    });

    // ---- Candidates
    await check('candidates: register, duplicate, list, get', async () => {
      const c1 = await candidates.registerCandidate({
        electionId: E,
        candidateId: 'c1',
        name: 'Ana',
      });
      has(c1.data, { electionId: E, candidateId: 'c1' });
      show('registerCandidate', c1.data);
      await candidates.registerCandidate({ electionId: E, candidateId: 'c2', name: 'Luis' });
      await rejects(
        candidates.registerCandidate({ electionId: E, candidateId: 'c1', name: 'Ana' }),
        'ALREADY_EXISTS',
      );
      const list = await candidates.listCandidates(E);
      assert.ok(Array.isArray(list), 'listCandidates is not an array');
      assert.equal(list.length, 2);
      show('listCandidates[0]', list[0]);
      await rejects(candidates.getCandidate(E, 'zzz'), 'NOT_FOUND');
    });

    // ---- Voters
    await check('voters: register (idempotent), status', async () => {
      has((await voters.registerVoters({ electionId: E, voterHashes: [h1, h2] })).data, {
        received: 2,
        inserted: 2,
        skipped: 0,
      });
      has((await voters.registerVoters({ electionId: E, voterHashes: [h1, h2] })).data, {
        inserted: 0,
        skipped: 2,
      });
      has(await voters.getVoterStatus({ electionId: E, voterHash: h1 }), {
        status: 'ELIGIBLE',
        canIssueToken: true,
      });
      has(await voters.getVoterStatus({ electionId: E, voterHash: hNot }), {
        status: 'NOT_FOUND',
        canIssueToken: false,
      });
      await rejects(
        voters.issueToken({ electionId: E, voterHash: h1 }),
        'ELECTION_NOT_ACTIVE',
        'INVALID_STATE',
      );
    });

    // ---- Start
    await check('startElection, then cancel and late candidates are rejected', async () => {
      assert.equal((await elections.startElection(E)).data.status, 'ACTIVE');
      await rejects(elections.cancelElection(E), 'INVALID_STATE');
      await rejects(
        candidates.registerCandidate({ electionId: E, candidateId: 'c3', name: 'Tarde' }),
        'INVALID_STATE',
        'ELECTION_NOT_ACTIVE',
      );
    });

    // ---- Tokens and marks
    await check('issueToken, TOKEN_ACTIVE (with retryAfter), NOT_IN_ROLL', async () => {
      const issued = await voters.issueToken({ electionId: E, voterHash: h1 });
      assert.equal(issued.data.issuedCount, 1);
      assert.ok(issued.data.tokenExpiresAt);
      show('issueToken', issued.data);
      const active = await rejects(
        voters.issueToken({ electionId: E, voterHash: h1 }),
        'TOKEN_ACTIVE',
      );
      assert.equal(typeof active.data?.retryAfter, 'string', 'TOKEN_ACTIVE without retryAfter');
      await rejects(voters.issueToken({ electionId: E, voterHash: hNot }), 'NOT_IN_ROLL');
    });
    await check('markVotedBatch reports rejected voters; markVoted is idempotent', async () => {
      const batch = await voters.markVotedBatch({ electionId: E, voterHashes: [h1, h2, hNot] });
      show('markVotedBatch', batch.data);
      assert.equal(batch.data.marked, 1);
      assert.deepEqual(
        [...batch.data.rejected].sort((a, b) => a.voterHash.localeCompare(b.voterHash)),
        [
          { voterHash: h2, reason: 'NO_TOKEN_ISSUED' },
          { voterHash: hNot, reason: 'NOT_IN_ROLL' },
        ].sort((a, b) => a.voterHash.localeCompare(b.voterHash)),
      );
      const again = await voters.markVoted({ electionId: E, voterHash: h1 });
      has(again.data, { marked: 0, alreadyVoted: 1 });
      assert.deepEqual(again.data.rejected, []);
      assert.equal((await voters.getVoterStatus({ electionId: E, voterHash: h1 })).status, 'VOTED');
    });
    await check('results are hidden while the election is running', async () => {
      await rejects(voting.getTally(E, { profile: 'auditor' }), 'RESULTS_NOT_AVAILABLE');
      await rejects(
        voting.getVotesByElection(
          { electionId: E, pageSize: 10, bookmark: '1' },
          { profile: 'auditor' },
        ),
        'RESULTS_NOT_AVAILABLE',
      );
    });

    // ---- Close, tally, publish
    const wait = endDate.getTime() - Date.now() + 5_000;
    if (wait > 0) {
      console.log(`       waiting ${Math.ceil(wait / 1000)} s until endDate...`);
      await sleep(wait);
    }
    await check('closeElection, tally, votes page, publishElection', async () => {
      assert.equal((await elections.closeElection(E)).data.status, 'CLOSED');
      const tally = await voting.getTally(E, { profile: 'auditor' });
      show('getTally', tally);
      has(tally, { status: 'CLOSED', total: 0 });
      assert.equal(tally.results.length, 2);
      const page = await voting.getVotesByElection(
        { electionId: E, pageSize: 10, bookmark: '1' },
        { profile: 'auditor' },
      );
      has(page, { count: 0, hasMore: false });
      assert.equal((await elections.publishElection(E)).data.status, 'PUBLISHED');
    });

    console.log('\nFabric integration: ALL OK');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(`\nFabric integration: FAILED (${(err as Error).message.split('\n')[0]})`);
  process.exit(1);
});
