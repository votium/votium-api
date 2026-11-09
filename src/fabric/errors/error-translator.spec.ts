import { translateFabricError } from './error-translator';
import { FabricPhaseError } from './fabric-phase.error';
import { commitFailure } from './fabric.error';

const grpcLike = (props: Record<string, unknown>, message = 'raw gateway message'): Error =>
  Object.assign(new Error(message), props);
const detail = (message: string) => ({ mspId: 'Org1MSP', address: 'peer', message });
const endorse = (messages: string[], code = 10): FabricPhaseError =>
  new FabricPhaseError('endorse', 'tx1', grpcLike({ code, details: messages.map(detail) }));

describe('translateFabricError', () => {
  it('maps a chaincode rejection to its business code', () => {
    const e = translateFabricError(
      endorse(['chaincode response 500, ALREADY_VOTED: El votante ya votó']),
    );
    expect(e.code).toBe('ALREADY_VOTED');
    expect(e.httpStatus).toBe(409);
    expect(e.outcome).toBe('NOT_COMMITTED');
    expect(e.retryable).toBe(false);
  });

  it('extracts retryAfter from TOKEN_ACTIVE', () => {
    const e = translateFabricError(
      endorse([
        'chaincode response 500, TOKEN_ACTIVE: Ya existe una firma vigente; podrá solicitar otra desde 2026-11-10T14:05:00.000Z',
      ]),
    );
    expect(e.code).toBe('TOKEN_ACTIVE');
    expect(e.data).toEqual({ retryAfter: '2026-11-10T14:05:00.000Z' });
  });

  it('maps a read (evaluate) error that carries the code in the top message', () => {
    const e = translateFabricError(
      grpcLike(
        { code: 2, details: [] },
        '2 UNKNOWN: evaluate call to endorser returned error: chaincode response 500, NOT_FOUND: no existe',
      ),
    );
    expect(e.code).toBe('NOT_FOUND');
    expect(e.httpStatus).toBe(404);
  });

  it('endorsement failure without a chaincode code is retryable', () => {
    const e = translateFabricError(endorse(['failed to select a set of endorsers']));
    expect(e.code).toBe('FABRIC_ENDORSEMENT_FAILED');
    expect(e.retryable).toBe(true);
    expect(e.outcome).toBe('NOT_COMMITTED');
    expect(e.txId).toBe('tx1');
  });

  it('an unreachable peer is retryable, in endorsement and in reads', () => {
    const inEndorse = translateFabricError(
      new FabricPhaseError('endorse', 'tx1', grpcLike({ code: 14, details: [] })),
    );
    expect(inEndorse.code).toBe('FABRIC_UNAVAILABLE');
    expect(inEndorse.retryable).toBe(true);
    expect(translateFabricError(grpcLike({ code: 14, details: [] })).code).toBe(
      'FABRIC_UNAVAILABLE',
    );
    expect(translateFabricError(grpcLike({ code: 4, details: [] })).code).toBe(
      'FABRIC_UNAVAILABLE',
    );
  });

  it('any failure after endorsement has an unknown outcome and keeps the txId', () => {
    for (const code of [4, 14, 2]) {
      const e = translateFabricError(
        new FabricPhaseError('submit', 'abc', grpcLike({ code, details: [] })),
      );
      expect(e.code).toBe('FABRIC_OUTCOME_UNKNOWN');
      expect(e.outcome).toBe('UNKNOWN');
      expect(e.retryable).toBe(false);
      expect(e.txId).toBe('abc');
    }
  });

  it('classifies commit failures: 11 and 12 are conflicts, others are rejections', () => {
    for (const code of [11, 12]) {
      const e = commitFailure('t', code);
      expect(e.code).toBe('FABRIC_CONFLICT');
      expect(e.retryable).toBe(true);
    }
    const rejected = commitFailure('t', 10);
    expect(rejected.code).toBe('FABRIC_COMMIT_REJECTED');
    expect(rejected.retryable).toBe(false);
    expect(rejected.data).toEqual({ statusCode: 10 });
  });

  it('never leaks raw text, the cause or the txId in the HTTP body', () => {
    const e = translateFabricError(
      endorse(['chaincode response 500, NOT_IN_ROLL: hash 0123abcd no está']),
    );
    const body = JSON.stringify(e.toResponse());
    expect(body).not.toContain('0123abcd');
    expect(body).not.toContain('tx1');
    expect(e.message).toBe('NOT_IN_ROLL');
  });

  it('unknown failures become FABRIC_INTERNAL without echoing the message', () => {
    expect(translateFabricError(new Error('secret detail')).code).toBe('FABRIC_INTERNAL');
    expect(
      JSON.stringify(translateFabricError(new Error('secret detail')).toResponse()),
    ).not.toContain('secret');
    expect(translateFabricError('a string').code).toBe('FABRIC_INTERNAL');
  });
});
