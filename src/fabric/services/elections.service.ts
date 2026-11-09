import { Injectable } from '@nestjs/common';
import { FabricInvoker } from '../client/fabric-invoker';
import { assertEndAfterStart, validateInput } from '../dto/validate';
import { CreateElectionDto, ElectionIdDto } from '../dto/inputs';
import { Election, ReadOptions, TxResult } from '../types';

@Injectable()
export class ElectionsService {
  constructor(private readonly fabric: FabricInvoker) { }

  async createElection(input: CreateElectionDto): Promise<TxResult<Election>> {
    const v = await validateInput(CreateElectionDto, input);
    assertEndAfterStart(v.startDate, v.endDate);
    return this.fabric.submit<Election>('elections', 'CreateElection', [
      v.electionId,
      v.name,
      v.startDate,
      v.endDate,
      v.signingPublicKey,
    ]);
  }

  startElection(electionId: string): Promise<TxResult<Election>> {
    return this.transition('StartElection', electionId);
  }
  cancelElection(electionId: string): Promise<TxResult<Election>> {
    return this.transition('CancelElection', electionId);
  }
  closeElection(electionId: string): Promise<TxResult<Election>> {
    return this.transition('CloseElection', electionId);
  }
  publishElection(electionId: string): Promise<TxResult<Election>> {
    return this.transition('PublishElection', electionId);
  }

  async getElection(electionId: string, opts: ReadOptions = {}): Promise<Election> {
    const v = await validateInput(ElectionIdDto, { electionId });
    return this.fabric.evaluate<Election>('elections', 'GetElection', [v.electionId], opts.profile);
  }

  listElections(opts: ReadOptions = {}): Promise<Election[]> {
    return this.fabric.evaluate<Election[]>('elections', 'ListElections', [], opts.profile);
  }

  private async transition(fn: string, electionId: string): Promise<TxResult<Election>> {
    const v = await validateInput(ElectionIdDto, { electionId });
    return this.fabric.submit<Election>('elections', fn, [v.electionId]);
  }
}
