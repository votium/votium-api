import { Injectable } from '@nestjs/common';
import { FabricInvoker } from '../client/fabric-invoker';
import { CreateElectionDto, ElectionIdDto } from '../dto/inputs';
import { assertEndAfterStart, validateInput } from '../dto/validate';
import { Election, ElectionStatus, ReadOptions, TxResult } from '../types';

@Injectable()
export class ElectionsService {
  constructor(private readonly fabric: FabricInvoker) { }

  async createElection(input: CreateElectionDto): Promise<TxResult<Election>> {
    const v = await validateInput(CreateElectionDto, input);
    assertEndAfterStart(v.startDate, v.endDate);
    return this.fabric.submit<Election>(
      'elections',
      'CreateElection',
      [v.electionId, v.name, v.startDate, v.endDate, v.signingPublicKey],
      {
        // After an unknown outcome: the election exists with exactly these data => the first attempt was applied.
        reconcile: async () => {
          const e = await this.peek(v.electionId);
          const same =
            e &&
            e.name === v.name &&
            Date.parse(e.startDate) === Date.parse(v.startDate) &&
            Date.parse(e.endDate) === Date.parse(v.endDate) &&
            e.signingPublicKey.trim() === v.signingPublicKey.trim();
          return same ? e : undefined;
        },
      },
    );
  }

  startElection(electionId: string): Promise<TxResult<Election>> {
    return this.transition('StartElection', electionId, 'ACTIVE');
  }
  cancelElection(electionId: string): Promise<TxResult<Election>> {
    return this.transition('CancelElection', electionId, 'CANCELED');
  }
  closeElection(electionId: string): Promise<TxResult<Election>> {
    return this.transition('CloseElection', electionId, 'CLOSED');
  }
  publishElection(electionId: string): Promise<TxResult<Election>> {
    return this.transition('PublishElection', electionId, 'PUBLISHED');
  }

  async getElection(electionId: string, opts: ReadOptions = {}): Promise<Election> {
    const v = await validateInput(ElectionIdDto, { electionId });
    return this.fabric.evaluate<Election>('elections', 'GetElection', [v.electionId], opts.profile);
  }

  listElections(opts: ReadOptions = {}): Promise<Election[]> {
    return this.fabric.evaluate<Election[]>('elections', 'ListElections', [], opts.profile);
  }

  private async transition(
    fn: string,
    electionId: string,
    target: ElectionStatus,
  ): Promise<TxResult<Election>> {
    const v = await validateInput(ElectionIdDto, { electionId });
    return this.fabric.submit<Election>('elections', fn, [v.electionId], {
      // After an unknown outcome: the election is already in the target state.
      reconcile: async () => {
        const e = await this.peek(v.electionId);
        return e?.status === target ? e : undefined;
      },
    });
  }

  private async peek(electionId: string): Promise<Election | undefined> {
    try {
      return await this.getElection(electionId);
    } catch {
      return undefined;
    }
  }
}
