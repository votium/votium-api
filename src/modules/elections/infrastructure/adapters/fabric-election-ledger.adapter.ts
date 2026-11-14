import { Injectable } from '@nestjs/common';

import { ElectionsService } from '../../../../fabric/services/elections.service';
import { CandidatesService } from '../../../../fabric/services/candidates.service';
import { VotersService } from '../../../../fabric/services/voters.service';

import { ElectionLedgerPort } from '../../application/ports/election-ledger.port';
import {
  CreateElectionLedgerResultDto,
  CreateElectionLedgerDto,
  ElectionLedgerDto,
  RegisterCandidateLedgerDto,
  RegisterCandidateLedgerResultDto,
  RegisterElectoralRollLedgerDto,
  RegisterElectoralRollLedgerResultDto,
} from '../../application/dtos/';
import { CreateElectionLedgerMapper } from '../mappers/create-election-ledger.mapper';
import { ElectionLedgerMapper } from '../mappers/election-ledger.mapper';
import { CandidateLedgerMapper } from '../mappers/candidate-ledger.mapper';
import { ElectoralRollLedgerMapper } from '../mappers/electoral-roll-ledger.mapper';

@Injectable()
export class FabricElectionLedgerAdapter implements ElectionLedgerPort {
  constructor(
    private readonly electionsService: ElectionsService,
    private readonly candidateService: CandidatesService,
    private readonly votersService: VotersService,
  ) {}

  async create(input: CreateElectionLedgerDto): Promise<CreateElectionLedgerResultDto> {
    const fabricInput = CreateElectionLedgerMapper.toFabricCreateInput(input);

    const response = await this.electionsService.createElection(fabricInput);

    if (response.blockNumber === null) {
      throw new Error('Fabric no devolvió el número de bloque de la elección');
    }

    return CreateElectionLedgerMapper.toApplicationResult(response);
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

  async get(electionId: string): Promise<ElectionLedgerDto> {
    const response = await this.electionsService.getElection(electionId);

    return ElectionLedgerMapper.toApplicationResult(response);
  }

  async regsiterCandidate(
    input: RegisterCandidateLedgerDto,
  ): Promise<RegisterCandidateLedgerResultDto> {
    const response = await this.candidateService.registerCandidate(input);

    return CandidateLedgerMapper.toApplicationResult(response);
  }

  async registerElectoralRoll(
    input: RegisterElectoralRollLedgerDto,
  ): Promise<RegisterElectoralRollLedgerResultDto> {
    const response = await this.votersService.registerVoters(input);

    return ElectoralRollLedgerMapper.toApplicationResult(response);
  }
}
