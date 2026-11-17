import { Inject } from '@nestjs/common';
import {
  ELECTION_CANDIDATES_PORT,
  type ElectionCandidatesPort,
} from '../../domain/ports/election-candidates.port';
import { type ElectionRepository } from '../../domain/repositories/election.repository.interface';
import { type ElectoralRollRepository } from '../../domain/repositories/electoral-roll.repository.interface';
import { ElectionLedgerPort } from '../ports/election-ledger.port';
import { ElectionSigningKeyPort } from '../ports/election-signing-key.port';
import { ELECTION_STATUS_VALUES } from '../../domain/value-objects/election-status.vo';
import { CreateElectionLedgerDto } from '../dtos';
import { type VoterHasherPort, VOTER_HASHER_PORT } from 'src/shared/domain/ports/voter-hasher.port';
import { ElectionAuditPort } from '../ports/election-audit.port';

export class RegisterElectionToBlockchainUseCase {
  constructor(
    private readonly electionRepository: ElectionRepository,
    @Inject(ELECTION_CANDIDATES_PORT)
    private readonly candidacyRepository: ElectionCandidatesPort,
    private readonly electoralRollRepository: ElectoralRollRepository,
    private readonly electionLedger: ElectionLedgerPort,
    private readonly electionSigningKey: ElectionSigningKeyPort,
    @Inject(VOTER_HASHER_PORT)
    private readonly voterHasher: VoterHasherPort,
    private readonly auditPort: ElectionAuditPort,
  ) {}

  async execute(electionId: string, actorId: string): Promise<void> {
    const election = await this.electionRepository.findById(electionId);

    if (!election) {
      throw new Error(`Election with ID ${electionId} not found`);
    }

    if (election.currentStatus !== ELECTION_STATUS_VALUES[6]) {
      throw new Error(`Election with ID ${electionId} is not in FINALIZING status`);
    }

    const candidates = await this.candidacyRepository.getCandidaciesByElection(electionId);
    const electoralRoll = await this.electoralRollRepository.findByElectionId(electionId);

    if (!candidates || candidates.length === 0) {
      throw new Error(`No candidates found for election with ID ${electionId}`);
    }

    if (!electoralRoll || electoralRoll.length === 0) {
      throw new Error(`No electoral roll found for election with ID ${electionId}`);
    }

    const signingKey = await this.electionSigningKey.ensureKey(electionId);
    if (!signingKey) {
      throw new Error(`Signing key not found for election with ID ${electionId}`);
    }

    const electionLedger: CreateElectionLedgerDto = {
      electionId: election.id ?? '',
      name: election.name,
      startDate: election.startDate,
      endDate: election.endDate,
      startTime: election.startTime,
      endTime: election.endTime,
      signingPublicKey: signingKey,
    };

    const audit = await this.auditPort.recordBlockchainAction({
      actorId,
      actionType: 'CREATE_ELECTION',
      electionId: election.id ?? '',
      status: 'PENDING',
      summary: `Registrando elección con ID ${electionId} en Hyperledger Fabric`,
      transactions: [],
    });

    try {
      const createdElectionLedger = await this.electionLedger.create(electionLedger);
      await this.auditPort.updateBlockchainActionStatus(audit.id, 'PARTIAL_SUCCESS', [
        {
          step: 'CREATE_ELECTION',
          txId: createdElectionLedger.txId ?? '',
          status: 'SUCCESS',
          blockNumber: createdElectionLedger.blockNumber ?? 0,
        },
      ]);
    } catch {
      await this.auditPort.updateBlockchainActionStatus(audit.id, 'FAILED');
      throw new Error(
        `Failed to register election with ID ${electionId} on the Hyperledger Fabric`,
      );
    }

    try {
      const txIdCandidates: { step: string; txId: string; status: string; blockNumber: number }[] =
        [];
      for (const candidate of candidates) {
        const registerCandidateResult = await this.electionLedger.regsiterCandidate({
          electionId: election.id ?? '',
          candidateId: candidate.id,
          name: candidate.candidate.name,
          // positionNumber: candidate.positionNumber, TODO Add position number to the ledger registration if needed
        });

        txIdCandidates.push({
          step: `REGISTER_CANDIDATE_${candidate.id}`,
          txId: registerCandidateResult.txId ?? '',
          status: 'SUCCESS',
          blockNumber: registerCandidateResult.blockNumber ?? 0,
        });
      }

      await this.auditPort.updateBlockchainActionStatus(
        audit.id,
        'PARTIAL_SUCCESS',
        txIdCandidates,
      );
    } catch {
      await this.auditPort.updateBlockchainActionStatus(audit.id, 'PARTIAL_SUCCESS');
      throw new Error(
        `Failed to register candidates for election with ID ${electionId} on the Hyperledger Fabric`,
      );
    }

    try {
      const voterHashPayloads = electoralRoll.map((elector) => ({
        electionId: election.id ?? '',
        electorId: elector.electorId,
      }));
      const voterHashes = await this.voterHasher.hashBatch(voterHashPayloads);

      const registerElectoralRollResult = await this.electionLedger.registerElectoralRoll({
        electionId: election.id ?? '',
        voterHashes: voterHashes,
      });
      await this.auditPort.updateBlockchainActionStatus(audit.id, 'SUCCESS', [
        {
          step: 'REGISTER_ELECTORAL_ROLL',
          txId: registerElectoralRollResult.txId ?? '',
          status: 'SUCCESS',
          blockNumber: registerElectoralRollResult.blockNumber ?? 0,
        },
      ]);
    } catch {
      await this.auditPort.updateBlockchainActionStatus(audit.id, 'PARTIAL_SUCCESS');
      throw new Error(
        `Failed to register electoral roll for election with ID ${electionId} on the Hyperledger Fabric`,
      );
    }

    await this.electionRepository.updateStatus(
      electionId,
      ELECTION_STATUS_VALUES[1],
      null,
      ELECTION_STATUS_VALUES[6],
    );
  }
}
