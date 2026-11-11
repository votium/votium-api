import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { fabricConfig } from '../config/fabric.config';
import { translateFabricError } from '../errors/error-translator';
import { FabricPhaseError } from '../errors/fabric-phase.error';
import { FabricError, internalError } from '../errors/fabric.error';
import { CHAINCODES, ChaincodeName, FabricProfile } from '../fabric.constants';
import { TxResult } from '../types';
import { FabricClientRegistry } from './fabric-client.registry';
import { Semaphore } from './semaphore';

const decoder = new TextDecoder();

function parse<T>(bytes: Uint8Array): T {
  const text = decoder.decode(bytes);
  if (!text) return null as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw internalError(new Error('Non-JSON response from chaincode'));
  }
}

export interface SubmitOptions<T> {
  /** Sending the same transaction again is safe (the contract is idempotent for it). Used once after an unknown outcome. */
  idempotent?: boolean;
  /** Reads the ledger to decide whether a transaction with an unknown outcome was applied. Must not throw to be useful. */
  reconcile?: () => Promise<T | undefined>;
  /** Only evaluated when RETRYING after an unknown outcome: maps a rejection that proves the first attempt landed. */
  recoverFromError?: (err: FabricError) => T | undefined;
}

// Raw cause for diagnostics. Only logged when FABRIC_LOG_CAUSE=true.
function causeText(err: FabricError): string {
  let cause: unknown = (err as { cause?: unknown }).cause;
  if (cause instanceof FabricPhaseError) cause = cause.original;
  const parts: string[] = [cause instanceof Error ? cause.message : String(cause)];
  const details = (cause as { details?: unknown } | null)?.details;
  if (Array.isArray(details))
    for (const d of details) parts.push(String((d as { message?: unknown })?.message ?? ''));
  return parts.join(' | ').replace(/\s+/g, ' ').slice(0, 300);
}

/** The only place that talks to the network. Never logs arguments (they carry voter hashes and nullifiers). */
@Injectable()
export class FabricInvoker {
  private readonly logger = new Logger('Fabric');
  private readonly slots: Semaphore;
  private readonly policy: ConfigType<typeof fabricConfig>['resilience'];

  constructor(
    private readonly registry: FabricClientRegistry,
    @Inject(fabricConfig.KEY) config: ConfigType<typeof fabricConfig>,
  ) {
    this.policy = config.resilience;
    this.slots = new Semaphore(this.policy.maxConcurrentSubmits);
  }

  /** Writes always use the "writer" identity and wait for the commit. */
  async submit<T>(
    chaincode: ChaincodeName,
    fn: string,
    args: string[],
    opts: SubmitOptions<T> = {},
  ): Promise<TxResult<T>> {
    this.assertFunction(chaincode, fn);
    const release = await this.slots.acquire();
    try {
      return await this.submitLoop<T>(chaincode, fn, args, opts);
    } finally {
      release();
    }
  }

  async evaluate<T>(
    chaincode: ChaincodeName,
    fn: string,
    args: string[],
    profile: FabricProfile = 'writer',
  ): Promise<T> {
    this.assertFunction(chaincode, fn);
    for (let attempt = 1; ; attempt++) {
      const started = Date.now();
      try {
        const bytes = await this.registry
          .get(profile)
          .evaluate(chaincode, CHAINCODES[chaincode].contract, fn, args);
        this.logger.debug(`${chaincode}.${fn} evaluated as ${profile} ${Date.now() - started}ms`);
        return parse<T>(bytes);
      } catch (e) {
        const err = this.fail(chaincode, fn, e, started);
        if (!err.retryable || attempt >= this.policy.maxAttempts) throw err;
        await this.backoff(attempt);
      }
    }
  }

  private async submitLoop<T>(
    chaincode: ChaincodeName,
    fn: string,
    args: string[],
    opts: SubmitOptions<T>,
  ): Promise<TxResult<T>> {
    let afterUnknown = false;
    let unknownTxId: string | undefined;

    for (let attempt = 1; ; attempt++) {
      try {
        const r = await this.submitOnce<T>(chaincode, fn, args);
        return afterUnknown ? { ...r, recovered: true } : r;
      } catch (e) {
        const err = e as FabricError;

        if (afterUnknown && opts.recoverFromError) {
          const data = opts.recoverFromError(err);
          if (data !== undefined) {
            this.logger.log(
              `${chaincode}.${fn} recovered after unknown outcome (code=${err.code}) tx=${unknownTxId ?? '-'}`,
            );
            return {
              data,
              txId: unknownTxId ?? err.txId ?? '',
              blockNumber: null,
              recovered: true,
            };
          }
        }

        const last = attempt >= this.policy.maxAttempts;
        if (err.code === 'FABRIC_OUTCOME_UNKNOWN') {
          unknownTxId = err.txId ?? unknownTxId;
          const reconciled = await this.tryReconcile(opts.reconcile);
          if (reconciled !== undefined) {
            this.logger.log(
              `${chaincode}.${fn} reconciled after unknown outcome tx=${unknownTxId ?? '-'}`,
            );
            return {
              data: reconciled,
              txId: unknownTxId ?? '',
              blockNumber: null,
              recovered: true,
            };
          }
          if (!opts.idempotent || afterUnknown || last) throw err;
          afterUnknown = true; // resend once
        } else if (!(err.retryable && err.outcome === 'NOT_COMMITTED') || last) {
          throw err;
        }
        await this.backoff(attempt);
      }
    }
  }

  private async submitOnce<T>(
    chaincode: ChaincodeName,
    fn: string,
    args: string[],
  ): Promise<TxResult<T>> {
    const started = Date.now();
    try {
      const r = await this.registry
        .get('writer')
        .submit(chaincode, CHAINCODES[chaincode].contract, fn, args);
      this.logger.log(
        `${chaincode}.${fn} committed tx=${r.txId} block=${r.blockNumber} ${Date.now() - started}ms`,
      );
      return { data: parse<T>(r.result), txId: r.txId, blockNumber: r.blockNumber };
    } catch (err) {
      throw this.fail(chaincode, fn, err, started);
    }
  }

  private async tryReconcile<T>(fn?: () => Promise<T | undefined>): Promise<T | undefined> {
    if (!fn) return undefined;
    try {
      return await fn();
    } catch {
      return undefined;
    }
  }

  private backoff(attempt: number): Promise<void> {
    const base = this.policy.retryBaseMs;
    if (base === 0) return Promise.resolve();
    return new Promise((resolve) =>
      setTimeout(resolve, base * 2 ** (attempt - 1) * (0.5 + Math.random())),
    );
  }

  private fail(chaincode: string, fn: string, err: unknown, started: number): FabricError {
    const translated = translateFabricError(err);
    const level =
      translated.code === 'FABRIC_INTERNAL' || translated.code === 'FABRIC_OUTCOME_UNKNOWN'
        ? 'error'
        : 'warn';
    let line = `${chaincode}.${fn} failed code=${translated.code} outcome=${translated.outcome ?? '-'} tx=${translated.txId ?? '-'} ${Date.now() - started}ms`;
    if (
      this.policy.logCause &&
      translated.code !== 'VALIDATION_ERROR' &&
      translated.outcome !== 'NOT_COMMITTED'
    ) {
      line += ` cause="${causeText(translated)}"`;
    } else if (this.policy.logCause && translated.code === 'FABRIC_ENDORSEMENT_FAILED') {
      line += ` cause="${causeText(translated)}"`;
    }
    this.logger[level](line);
    return translated;
  }

  // Catches typos at the call site instead of failing on the network.
  private assertFunction(chaincode: ChaincodeName, fn: string): void {
    if (!(CHAINCODES[chaincode].functions as readonly string[]).includes(fn)) {
      throw internalError(new Error(`${fn} is not a function of ${chaincode}`));
    }
  }
}
