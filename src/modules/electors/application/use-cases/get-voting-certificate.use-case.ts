import { ElectionEntity } from 'src/modules/elections/domain/entities/election.entity';
import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import { ElectoralRollNotFoundError } from 'src/modules/elections/domain/errors/electoral-roll-not-found.error';
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import type { ElectoralRollCertificateReader } from 'src/modules/elections/domain/repositories/electoral-roll-certificate.reader';
import { CertificateNotAvailableError } from '../../domain/errors/certificate-not-available.error';
import { ElectorNotFoundError } from '../../domain/errors/elector-not-found.error';
import type { CertificateRepository } from '../../domain/repositories/certificate.repository.interface';
import type { ElectorRepository } from '../../domain/repositories/elector.repository.interface';
import type { VoterParticipationPort } from '../ports/voter-participation.port';

export interface GetVotingCertificateInput {
  electorId: string;
  electionId: string;
}

export interface VotingCertificateResult {
  electionName: string;
  votingDate: Date;
  voterName: string;
  voterCode: string;
  verificationCode: string;
}

// Issues (or reuses) the participation certificate of the authenticated voter. Authorized only
// when the ledger confirms VOTED; never reads the ballot content.
export class GetVotingCertificateUseCase {
  constructor(
    private readonly electors: ElectorRepository,
    private readonly elections: ElectionRepository,
    private readonly electoralRolls: ElectoralRollCertificateReader,
    private readonly certificates: CertificateRepository,
    private readonly voterParticipation: VoterParticipationPort,
  ) {}

  async execute(input: GetVotingCertificateInput): Promise<VotingCertificateResult> {
    const { electorId, electionId } = input;

    const elector = await this.electors.findById(electorId);
    if (!elector) throw new ElectorNotFoundError(electorId);

    const election = await this.elections.findById(electionId);
    if (!election) throw new ElectionNotFoundError(electionId);

    const roll = await this.electoralRolls.findCertificateRoll(electionId, electorId);
    if (!roll) throw new ElectoralRollNotFoundError(electionId, electorId);

    const voted = await this.voterParticipation.hasConfirmedVote({ electionId, electorId });
    if (!voted) throw new CertificateNotAvailableError(electionId);

    const certificate = await this.certificates.ensureForRoll({
      electoralRollId: roll.id,
      electionId,
    });

    return {
      electionName: election.name,
      votingDate:
        roll.lastVoteRegisteredAt ??
        new Date(ElectionEntity.toInstant(election.startDate, election.startTime)),
      voterName: `${elector.firstName} ${elector.lastName}`.trim(),
      voterCode: elector.studentCode,
      verificationCode: certificate.verificationCode,
    };
  }
}
