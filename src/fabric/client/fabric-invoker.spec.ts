jest.mock('./fabric-client.registry', () => ({
  FabricClientRegistry: class FabricClientRegistry {},
}));
jest.mock('../config/fabric.config', () => ({ fabricConfig: { KEY: 'fabric' } }));

import { Logger } from '@nestjs/common';
import { FabricPhaseError } from '../errors/fabric-phase.error';
import { FabricError } from '../errors/fabric.error';
import { FabricInvoker } from './fabric-invoker';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const ok = (data: unknown = {}, txId = 'tx', blockNumber = 7) => ({
  result: enc(JSON.stringify(data)),
  txId,
  blockNumber,
});
const grpcErr = (code: number, message = 'x', details: unknown[] = []): Error =>
  Object.assign(new Error(message), { code, details });

const unavailable = () => new FabricPhaseError('endorse', 't1', grpcErr(14));
const unknown = (txId = 'u1') => new FabricPhaseError('submit', txId, grpcErr(4));
const business = (code: string) =>
  new FabricPhaseError(
    'endorse',
    't2',
    grpcErr(10, 'x', [{ message: `chaincode response 500, ${code}: m` }]),
  );

function make(over: Record<string, unknown> = {}) {
  const client = { submit: jest.fn(), evaluate: jest.fn() };
  const registry = { get: jest.fn().mockReturnValue(client) };
  const config = {
    resilience: {
      maxAttempts: 3,
      retryBaseMs: 0,
      maxConcurrentSubmits: 32,
      logCause: false,
      ...over,
    },
  };
  return { client, invoker: new FabricInvoker(registry as never, config as never) };
}

const logged: string[] = [];
beforeEach(() => {
  logged.length = 0;
  for (const m of ['log', 'warn', 'error', 'debug'] as const) {
    jest.spyOn(Logger.prototype, m).mockImplementation((message: unknown, ..._: unknown[]) => {
      logged.push(String(message));
    });
  }
});
afterEach(() => jest.restoreAllMocks());

describe('FabricInvoker.submit', () => {
  it('retries failures that left nothing committed', async () => {
    const { client, invoker } = make();
    client.submit.mockRejectedValueOnce(unavailable()).mockResolvedValueOnce(ok({ a: 1 }));
    const r = await invoker.submit('voters', 'RegisterVoters', ['E']);
    expect(client.submit).toHaveBeenCalledTimes(2);
    expect(r.data).toEqual({ a: 1 });
    expect(r.recovered).toBeUndefined();
  });

  it('does not retry business rejections', async () => {
    const { client, invoker } = make();
    client.submit.mockRejectedValue(business('ALREADY_VOTED'));
    await expect(invoker.submit('voters', 'MarkVoted', ['E'])).rejects.toMatchObject({
      code: 'ALREADY_VOTED',
    });
    expect(client.submit).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxAttempts', async () => {
    const { client, invoker } = make();
    client.submit.mockRejectedValue(unavailable());
    await expect(invoker.submit('voters', 'MarkVoted', ['E'])).rejects.toMatchObject({
      code: 'FABRIC_UNAVAILABLE',
    });
    expect(client.submit).toHaveBeenCalledTimes(3);
  });

  it('unknown outcome + idempotent: resends once and flags the result as recovered', async () => {
    const { client, invoker } = make();
    client.submit
      .mockRejectedValueOnce(unknown())
      .mockResolvedValueOnce(ok({ marked: 0, alreadyVoted: 1 }));
    const r = await invoker.submit('voters', 'MarkVoted', ['E'], { idempotent: true });
    expect(client.submit).toHaveBeenCalledTimes(2);
    expect(r.recovered).toBe(true);
  });

  it('unknown outcome twice: stops after the second', async () => {
    const { client, invoker } = make();
    client.submit.mockRejectedValue(unknown());
    await expect(
      invoker.submit('voters', 'MarkVoted', ['E'], { idempotent: true }),
    ).rejects.toMatchObject({ code: 'FABRIC_OUTCOME_UNKNOWN' });
    expect(client.submit).toHaveBeenCalledTimes(2);
  });

  it('unknown outcome without idempotency: surfaces it, with the txId, and never resends', async () => {
    const { client, invoker } = make();
    client.submit.mockRejectedValue(unknown('u1'));
    await expect(invoker.submit('voters', 'IssueToken', ['E'])).rejects.toMatchObject({
      code: 'FABRIC_OUTCOME_UNKNOWN',
      txId: 'u1',
    });
    expect(client.submit).toHaveBeenCalledTimes(1);
  });

  it('reconcile resolves an unknown outcome without resending', async () => {
    const { client, invoker } = make();
    client.submit.mockRejectedValue(unknown('u1'));
    const r = await invoker.submit('elections', 'StartElection', ['E'], {
      reconcile: () => Promise.resolve({ status: 'ACTIVE' }),
    });
    expect(client.submit).toHaveBeenCalledTimes(1);
    expect(r).toEqual({
      data: { status: 'ACTIVE' },
      txId: 'u1',
      blockNumber: null,
      recovered: true,
    });
  });

  it('a failing reconcile falls back to the idempotency policy', async () => {
    const { client, invoker } = make();
    client.submit.mockRejectedValueOnce(unknown()).mockResolvedValueOnce(ok());
    const r = await invoker.submit('voters', 'MarkVoted', ['E'], {
      idempotent: true,
      reconcile: () => {
        throw new Error('read failed');
      },
    });
    expect(client.submit).toHaveBeenCalledTimes(2);
    expect(r.recovered).toBe(true);
  });

  it('recoverFromError turns "already applied" into success, but only after an unknown outcome', async () => {
    const recover = (e: FabricError) =>
      e.code === 'NULLIFIER_USED' ? { accepted: true } : undefined;

    const after = make();
    after.client.submit
      .mockRejectedValueOnce(unknown())
      .mockRejectedValueOnce(business('NULLIFIER_USED'));
    const r = await after.invoker.submit('voting', 'CastVote', ['E'], {
      idempotent: true,
      recoverFromError: recover,
    });
    expect(r).toMatchObject({ data: { accepted: true }, recovered: true, blockNumber: null });

    const first = make();
    first.client.submit.mockRejectedValue(business('NULLIFIER_USED'));
    await expect(
      first.invoker.submit('voting', 'CastVote', ['E'], {
        idempotent: true,
        recoverFromError: recover,
      }),
    ).rejects.toMatchObject({ code: 'NULLIFIER_USED' });
  });

  it('limits concurrent submits', async () => {
    const { client, invoker } = make({ maxConcurrentSubmits: 2 });
    let active = 0;
    let peak = 0;
    client.submit.mockImplementation(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      return ok();
    });
    await Promise.all(
      Array.from({ length: 6 }, () => invoker.submit('voters', 'MarkVoted', ['E'])),
    );
    expect(peak).toBe(2);
  });

  it('rejects functions that are not in the catalogue without touching the network', async () => {
    const { client, invoker } = make();
    await expect(invoker.submit('voters', 'Nope', [])).rejects.toMatchObject({
      code: 'FABRIC_INTERNAL',
    });
    expect(client.submit).not.toHaveBeenCalled();
  });
});

describe('FabricInvoker.evaluate', () => {
  it('retries when the peer is unavailable and does not retry rejections', async () => {
    const a = make();
    a.client.evaluate.mockRejectedValueOnce(grpcErr(14)).mockResolvedValueOnce(enc('{}'));
    await expect(a.invoker.evaluate('elections', 'ListElections', [])).resolves.toEqual({});
    expect(a.client.evaluate).toHaveBeenCalledTimes(2);

    const b = make();
    b.client.evaluate.mockRejectedValue(grpcErr(2, 'chaincode response 500, NOT_FOUND: x'));
    await expect(b.invoker.evaluate('elections', 'GetElection', ['E'])).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(b.client.evaluate).toHaveBeenCalledTimes(1);
  });
});

describe('FabricInvoker logging', () => {
  it('never logs arguments', async () => {
    const { client, invoker } = make();
    client.submit
      .mockResolvedValueOnce(ok())
      .mockRejectedValueOnce(business('ALREADY_VOTED'))
      .mockRejectedValueOnce(unknown());
    client.evaluate.mockRejectedValue(grpcErr(14));
    const args = ['SECRET-ARG'];
    await invoker.submit('voters', 'MarkVoted', args);
    await invoker.submit('voters', 'MarkVoted', args).catch(() => undefined);
    await invoker.submit('voters', 'MarkVoted', args).catch(() => undefined);
    await invoker.evaluate('voters', 'GetVoterStatus', args).catch(() => undefined);
    expect(logged.length).toBeGreaterThan(0);
    expect(logged.join('\n')).not.toContain('SECRET-ARG');
  });

  it('logs the raw cause only when FABRIC_LOG_CAUSE is on', async () => {
    const off = make();
    off.client.evaluate.mockRejectedValue(new Error('boom detail'));
    await off.invoker.evaluate('elections', 'ListElections', []).catch(() => undefined);
    expect(logged.join('\n')).not.toContain('boom detail');

    logged.length = 0;
    const on = make({ logCause: true });
    on.client.evaluate.mockRejectedValue(new Error('boom detail'));
    await on.invoker.evaluate('elections', 'ListElections', []).catch(() => undefined);
    expect(logged.join('\n')).toContain('boom detail');
  });
});
