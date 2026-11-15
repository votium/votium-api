import {
  businessError,
  CHAINCODE_ERROR_CODES,
  ChaincodeErrorCode,
  endorsementFailedError,
  FabricError,
  internalError,
  outcomeUnknownError,
  unavailableError,
} from './fabric.error';
import { FabricPhaseError } from './fabric-phase.error';

const GRPC_DEADLINE_EXCEEDED = 4;
const GRPC_UNAVAILABLE = 14;

// The chaincode throws "CODE: message"; the peer wraps it ("... chaincode response 500, CODE: message").
const CODE_RE = new RegExp(`(?:^|[\\s,:])(${CHAINCODE_ERROR_CODES.join('|')}):\\s`);
const ISO_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/;

// Structural access on purpose: the Gateway error classes are not reliable as runtime values across versions.
interface GatewayLike {
  message?: unknown;
  code?: unknown;
  details?: unknown;
}
const like = (e: unknown): GatewayLike => (e !== null && typeof e === 'object' ? e : {});
const grpcCode = (e: unknown): number | undefined =>
  typeof like(e).code === 'number' ? (like(e).code as number) : undefined;
const isTransient = (code?: number): boolean =>
  code === GRPC_UNAVAILABLE || code === GRPC_DEADLINE_EXCEEDED;

function allMessages(err: unknown): string[] {
  const g = like(err);
  const out = [typeof g.message === 'string' ? g.message : ''];
  if (Array.isArray(g.details)) {
    for (const d of g.details) {
      const m = (d as { message?: unknown } | null)?.message;
      if (typeof m === 'string') out.push(m);
    }
  }
  return out;
}

function chaincodeCode(err: unknown): { code: ChaincodeErrorCode; message: string } | undefined {
  for (const message of allMessages(err)) {
    const m = CODE_RE.exec(message);
    if (m) return { code: m[1] as ChaincodeErrorCode, message };
  }
  return undefined;
}

function beforeCommit(err: unknown, phase: 'endorse' | 'evaluate', txId?: string): FabricError {
  const business = chaincodeCode(err);
  if (business) {
    const data: Record<string, unknown> = {};
    if (business.code === 'TOKEN_ACTIVE') {
      const retryAfter = ISO_RE.exec(business.message)?.[0];
      if (retryAfter) data.retryAfter = retryAfter;
    }
    return businessError(business.code, err, Object.keys(data).length ? data : undefined);
  }
  if (isTransient(grpcCode(err))) return unavailableError(err, txId);
  return phase === 'endorse' ? endorsementFailedError(err, txId) : internalError(err);
}

/** Maps any failure to a FabricError. The raw error is kept as `cause` only. */
export function translateFabricError(err: unknown): FabricError {
  if (err instanceof FabricError) return err;
  if (err instanceof FabricPhaseError) {
    return err.phase === 'submit'
      ? outcomeUnknownError(err.original, err.txId)
      : beforeCommit(err.original, 'endorse', err.txId);
  }
  return beforeCommit(err, 'evaluate'); // reads (evaluate) and anything unexpected
}
