import { Injectable, Logger } from '@nestjs/common';
import { FabricError, internalError } from '../errors/fabric.error';
import { translateFabricError } from '../errors/error-translator';
import { CHAINCODES, ChaincodeName, FabricProfile } from '../fabric.constants';
import { TxResult } from '../types';
import { FabricClientRegistry } from './fabric-client.registry';

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

/** The only place that talks to the network. Never logs arguments (they carry voter hashes and nullifiers). */
@Injectable()
export class FabricInvoker {
  private readonly logger = new Logger('Fabric');

  constructor(private readonly registry: FabricClientRegistry) { }

  /** Writes always use the "writer" identity and wait for the commit. */
  async submit<T>(chaincode: ChaincodeName, fn: string, args: string[]): Promise<TxResult<T>> {
    this.assertFunction(chaincode, fn);
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

  async evaluate<T>(
    chaincode: ChaincodeName,
    fn: string,
    args: string[],
    profile: FabricProfile = 'writer',
  ): Promise<T> {
    this.assertFunction(chaincode, fn);
    const started = Date.now();
    try {
      const bytes = await this.registry
        .get(profile)
        .evaluate(chaincode, CHAINCODES[chaincode].contract, fn, args);
      this.logger.debug(`${chaincode}.${fn} evaluated as ${profile} ${Date.now() - started}ms`);
      return parse<T>(bytes);
    } catch (err) {
      throw this.fail(chaincode, fn, err, started);
    }
  }

  private fail(chaincode: string, fn: string, err: unknown, started: number): FabricError {
    const translated = translateFabricError(err);
    const level =
      translated.code === 'FABRIC_INTERNAL' || translated.code === 'FABRIC_OUTCOME_UNKNOWN'
        ? 'error'
        : 'warn';
    this.logger[level](
      `${chaincode}.${fn} failed code=${translated.code} outcome=${translated.outcome ?? '-'} tx=${translated.txId ?? '-'} ${Date.now() - started}ms`,
    );
    return translated;
  }

  // Catches typos at the call site instead of failing on the network.
  private assertFunction(chaincode: ChaincodeName, fn: string): void {
    if (!(CHAINCODES[chaincode].functions as readonly string[]).includes(fn)) {
      throw internalError(new Error(`${fn} is not a function of ${chaincode}`));
    }
  }
}
