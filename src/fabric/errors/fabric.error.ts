export const CHAINCODE_ERROR_CODES = [
  'FORBIDDEN',
  'INVALID_ARGUMENT',
  'NOT_FOUND',
  'ALREADY_EXISTS',
  'INVALID_STATE',
  'OUT_OF_WINDOW',
  'ELECTION_NOT_ACTIVE',
  'NOT_IN_ROLL',
  'ALREADY_VOTED',
  'TOKEN_ACTIVE',
  'NO_TOKEN_ISSUED',
  'INVALID_SIGNATURE',
  'NULLIFIER_USED',
  'RESULTS_NOT_AVAILABLE',
] as const;
export type ChaincodeErrorCode = (typeof CHAINCODE_ERROR_CODES)[number];

export type FabricErrorCode =
  | ChaincodeErrorCode
  | 'VALIDATION_ERROR'
  | 'FABRIC_UNAVAILABLE'
  | 'FABRIC_ENDORSEMENT_FAILED'
  | 'FABRIC_CONFLICT'
  | 'FABRIC_COMMIT_REJECTED'
  | 'FABRIC_OUTCOME_UNKNOWN'
  | 'FABRIC_INTERNAL';

/** User-facing messages live only here (single place to review or translate). Raw chaincode text is never forwarded. */
const BUSINESS = {
  FORBIDDEN: { status: 403, message: 'No tiene permiso para realizar esta operación.' },
  INVALID_ARGUMENT: { status: 400, message: 'Los datos enviados no son válidos.' },
  NOT_FOUND: { status: 404, message: 'El recurso solicitado no existe.' },
  ALREADY_EXISTS: { status: 409, message: 'El recurso ya existe.' },
  INVALID_STATE: {
    status: 409,
    message: 'La operación no es válida en el estado actual de la elección.',
  },
  OUT_OF_WINDOW: {
    status: 409,
    message: 'La operación está fuera del período permitido de la elección.',
  },
  ELECTION_NOT_ACTIVE: { status: 409, message: 'La elección no está activa.' },
  NOT_IN_ROLL: { status: 403, message: 'El votante no está en el padrón de esta elección.' },
  ALREADY_VOTED: { status: 409, message: 'El votante ya emitió su voto.' },
  TOKEN_ACTIVE: {
    status: 409,
    message: 'Ya existe una firma vigente; debe esperar a que venza para solicitar otra.',
  },
  NO_TOKEN_ISSUED: { status: 409, message: 'No hay una firma emitida para este votante.' },
  INVALID_SIGNATURE: { status: 400, message: 'La firma del voto no es válida.' },
  NULLIFIER_USED: { status: 409, message: 'Este voto ya fue registrado.' },
  RESULTS_NOT_AVAILABLE: { status: 409, message: 'Los resultados aún no están disponibles.' },
} satisfies Record<ChaincodeErrorCode, { status: number; message: string }>;

export interface FabricErrorInit {
  code: FabricErrorCode;
  httpStatus: number;
  publicMessage: string;
  retryable?: boolean;
  /** NOT_COMMITTED: nothing was written. UNKNOWN: it may have been committed. */
  outcome?: 'NOT_COMMITTED' | 'UNKNOWN';
  txId?: string;
  data?: Record<string, unknown>;
}

/** The only error type that leaves the fabric module. `message` is just the code; the cause stays internal. */
export class FabricError extends Error {
  readonly code: FabricErrorCode;
  readonly httpStatus: number;
  readonly publicMessage: string;
  readonly retryable: boolean;
  readonly outcome?: 'NOT_COMMITTED' | 'UNKNOWN';
  readonly txId?: string;
  readonly data?: Record<string, unknown>;

  constructor(init: FabricErrorInit, cause?: unknown) {
    super(init.code, { cause });
    this.name = 'FabricError';
    this.code = init.code;
    this.httpStatus = init.httpStatus;
    this.publicMessage = init.publicMessage;
    this.retryable = init.retryable ?? false;
    this.outcome = init.outcome;
    this.txId = init.txId;
    this.data = init.data;
  }

  /** Safe body for HTTP clients: no txId, no cause. */
  toResponse(): { code: FabricErrorCode; message: string; data?: Record<string, unknown> } {
    return {
      code: this.code,
      message: this.publicMessage,
      ...(this.data ? { data: this.data } : {}),
    };
  }
}

export const businessError = (
  code: ChaincodeErrorCode,
  cause: unknown,
  data?: Record<string, unknown>,
): FabricError =>
  new FabricError(
    {
      code,
      httpStatus: BUSINESS[code].status,
      publicMessage: BUSINESS[code].message,
      outcome: 'NOT_COMMITTED',
      data,
    },
    cause,
  );

export const validationError = (fields: Array<{ field: string; rule: string }>): FabricError =>
  new FabricError({
    code: 'VALIDATION_ERROR',
    httpStatus: 400,
    publicMessage: 'Los datos enviados no son válidos.',
    outcome: 'NOT_COMMITTED',
    data: { fields },
  });

export const unavailableError = (cause: unknown, txId?: string): FabricError =>
  new FabricError(
    {
      code: 'FABRIC_UNAVAILABLE',
      httpStatus: 503,
      retryable: true,
      outcome: 'NOT_COMMITTED',
      txId,
      publicMessage:
        'El registro de la elección no está disponible en este momento. Intente de nuevo.',
    },
    cause,
  );

export const endorsementFailedError = (cause: unknown, txId?: string): FabricError =>
  new FabricError(
    {
      code: 'FABRIC_ENDORSEMENT_FAILED',
      httpStatus: 503,
      retryable: true,
      outcome: 'NOT_COMMITTED',
      txId,
      publicMessage:
        'No fue posible obtener las aprobaciones necesarias de la red. Intente de nuevo.',
    },
    cause,
  );

export const conflictError = (txId?: string): FabricError =>
  new FabricError({
    code: 'FABRIC_CONFLICT',
    httpStatus: 409,
    retryable: true,
    outcome: 'NOT_COMMITTED',
    txId,
    publicMessage: 'La operación coincidió con otra simultánea. Intente de nuevo.',
  });

export const commitRejectedError = (txId: string, statusCode: number): FabricError =>
  new FabricError({
    code: 'FABRIC_COMMIT_REJECTED',
    httpStatus: 502,
    outcome: 'NOT_COMMITTED',
    txId,
    publicMessage: 'La red rechazó la operación al registrarla.',
    data: { statusCode },
  });

export const outcomeUnknownError = (cause: unknown, txId?: string): FabricError =>
  new FabricError(
    {
      code: 'FABRIC_OUTCOME_UNKNOWN',
      httpStatus: 504,
      outcome: 'UNKNOWN',
      txId,
      publicMessage:
        'No se pudo confirmar el resultado de la operación. Verifique su estado antes de repetirla.',
    },
    cause,
  );

export const internalError = (cause: unknown): FabricError =>
  new FabricError(
    {
      code: 'FABRIC_INTERNAL',
      httpStatus: 500,
      publicMessage: 'Ocurrió un error inesperado en el registro de la elección.',
    },
    cause,
  );

// TxValidationCode 11 (MVCC_READ_CONFLICT) and 12 (PHANTOM_READ_CONFLICT) are retryable conflicts;
// any other invalid status is a rejection by the ledger.
export const commitFailure = (txId: string, code: number): FabricError =>
  code === 11 || code === 12 ? conflictError(txId) : commitRejectedError(txId, code);
