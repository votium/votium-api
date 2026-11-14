import { Injectable } from '@nestjs/common';

import { ElectionsService } from '../../../../fabric/services/elections.service';

import {
  ElectionLedgerPort,
  CreateElectionLedgerInput,
} from '../../application/ports/election-ledger.port';

import { ElectionLedgerResultDto } from '../../application/dtos/election-ledger-result.dto';

import { ElectionLedgerMapper } from '../mappers/election-ledger.mapper';

@Injectable()
export class FabricElectionLedgerService implements ElectionLedgerPort {
  constructor(private readonly electionsService: ElectionsService) {}

  async create(input: CreateElectionLedgerInput): Promise<ElectionLedgerResultDto> {
    const fabricInput = ElectionLedgerMapper.toFabricCreateInput(input);

    const response = await this.electionsService.createElection(fabricInput);

    if (response.blockNumber === null) {
      throw new Error('Fabric no devolvió el número de bloque de la elección');
    }

    return ElectionLedgerMapper.toApplicationResult(response);
  }

  async start(electionId: string): Promise<void> {
    await this.electionsService.startElection(electionId);
  }

  async close(electionId: string): Promise<void> {
    await this.electionsService.closeElection(electionId);
  }

  async publish(electionId: string): Promise<void> {
    await this.electionsService.publishElection(electionId);
  }

  async cancel(electionId: string): Promise<void> {
    await this.electionsService.cancelElection(electionId);
  }

  async get(electionId: string): Promise<ElectionLedgerResultDto> {
    const response = await this.electionsService.getElection(electionId);

    return ElectionLedgerMapper.toApplicationResult({ data: response });
  }
}
