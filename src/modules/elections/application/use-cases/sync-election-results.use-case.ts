import { Injectable, Inject } from '@nestjs/common';
import { ElectionResultsPort } from '../ports/election-results.port';
import {
  type ResultsRepository,
  RESULTS_REPOSITORY,
} from '../../domain/repositories/results.repository.interface';
import { ResultEntity } from '../../domain/entities/result.entity';
import { ElectionAuditPort } from '../ports/election-audit.port';
import { ElectionTallyLedgerDto } from '../dtos';

@Injectable()
export class SyncElectionResultsUseCase {
  private audit = { id: 0 };
  private tally: ElectionTallyLedgerDto = {
    total: 0,
    status: 'PUBLISHED',
    results: [],
  };
  constructor(
    private readonly electionResultsPort: ElectionResultsPort,
    @Inject(RESULTS_REPOSITORY)
    private readonly resultsRepository: ResultsRepository,
    private readonly auditPort: ElectionAuditPort,
  ) {}

  async execute(electionId: string, actorId: string): Promise<void> {
    try {
      this.audit = await this.auditPort.recordBlockchainAction({
        actorId,
        actionType: 'SYNC_ELECTION_RESULTS',
        electionId,
        status: 'PENDING',
        summary: `Sincronizando resultados de la elección con ID ${electionId} en Hyperledger Fabric`,
        transactions: [],
      });
      this.tally = await this.electionResultsPort.tally(electionId);

      await this.auditPort.updateBlockchainActionStatus(this.audit.id, 'SUCCESS', [
        {
          step: 'SYNC_ELECTION_RESULTS',
          txId: '',
          status: 'SUCCESS',
          blockNumber: 0,
        },
      ]);
    } catch {
      await this.auditPort.updateBlockchainActionStatus(this.audit.id, 'FAILED', [
        {
          step: 'SYNC_ELECTION_RESULTS',
          txId: '',
          status: 'FAILED',
          blockNumber: 0,
          errorMessage: `Ocurrió un error al sincronizar los resultados de la elección con ID ${electionId} en Hyperledger Fabric`,
        },
      ]);
      throw new Error(
        `Failed to sync election results with ID ${electionId} on the Hyperledger Fabric`,
      );
    }

    const resultEntity = ResultEntity.create({
      total: this.tally.total,
      electionStatus: this.tally.status,
      electionId,
      candidacies: this.tally.results.map((entry) => ({
        candidateId: entry.candidateId,
        name: entry.name,
        votes: entry.votes,
      })),
    });

    await this.resultsRepository.saveResult(resultEntity);
  }
}
