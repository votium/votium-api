import { BadRequestException } from 'src/shared/exceptions/base/bad-request.exception';
import type {
  CandidacyRepository,
  CandidacyWithCandidate,
} from 'src/modules/candidacies/domain/repositories/candidacy.repository.interface';
import { ElectorNotFoundError } from 'src/modules/electors/domain/errors/elector-not-found.error';
import type { ElectorRepository } from 'src/modules/electors/domain/repositories/elector.repository.interface';
import type { ElectionEntity, ElectionStatus } from '../../domain/entities/election.entity';
import type {
  ElectionRepository,
  ElectionStatusHistoryEntry,
} from '../../domain/repositories/election.repository.interface';
import type { ElectoralRollRepository } from '../../domain/repositories/electoral-roll.repository.interface';
import { parseElectionDate } from '../election-date.util';

export interface VoterElectionListItem {
  election: ElectionEntity;
  statusHistory: ElectionStatusHistoryEntry[];
  candidacies: CandidacyWithCandidate[];
  registeredVoters: number;
  hasVoted: boolean;
  participationDate: Date | null;
}

export interface VoterElectionList {
  items: VoterElectionListItem[];
  total: number;
}

// POCO use case, registered via useFactory in ElectionsModule (project convention).
// The only elector identity it accepts is `electorId`, supplied by the controller from
// the authenticated JWT; there is no client-provided identity path.
export class GetVoterElectionsUseCase {
  constructor(
    private readonly elections: ElectionRepository,
    private readonly electoralRolls: ElectoralRollRepository,
    private readonly candidacies: CandidacyRepository,
    private readonly electors: ElectorRepository,
  ) {}

  async execute(params: {
    electorId: string;
    page: number;
    limit: number;
    electionCode?: string;
    status?: ElectionStatus;
    startDateFrom?: string;
    startDateTo?: string;
  }): Promise<VoterElectionList> {
    const page = Number.isFinite(params.page) && params.page > 0 ? params.page : 1;
    const limit = Number.isFinite(params.limit) && params.limit > 0 ? params.limit : 10;

    // Resolve the authenticated identity before any broad query. An unresolved
    // identity must never fall back to an unfiltered listing.
    const elector = await this.electors.findById(params.electorId);
    if (!elector) {
      throw new ElectorNotFoundError(params.electorId);
    }

    const startDateFrom = params.startDateFrom
      ? parseElectionDate(params.startDateFrom)
      : undefined;
    const startDateTo = params.startDateTo ? parseElectionDate(params.startDateTo) : undefined;

    if (startDateFrom && startDateTo && startDateFrom.getTime() > startDateTo.getTime()) {
      throw new BadRequestException(
        'startDateFrom must be less than or equal to startDateTo.',
        'ELECTION_INVALID_DATE_RANGE',
      );
    }

    const { rows, total } = await this.elections.findEligibleByElector({
      electorId: params.electorId,
      page,
      limit,
      electionCode: params.electionCode,
      status: params.status,
      startDateFrom,
      startDateTo,
    });

    if (rows.length === 0) {
      return { items: [], total };
    }

    const electionIds = rows
      .map((row) => row.election.id)
      .filter((id): id is string => id !== null);

    const [statusHistory, candidacies, rollCounts] = await Promise.all([
      this.elections.findStatusHistoryByElectionIds(electionIds),
      this.candidacies.findByElectionIds(electionIds),
      this.electoralRolls.countByElectionIds(electionIds),
    ]);

    const historyByElection = new Map<string, ElectionStatusHistoryEntry[]>();
    for (const entry of statusHistory) {
      const { electionId, ...historyEntry } = entry;
      const current = historyByElection.get(electionId) ?? [];
      current.push(historyEntry);
      historyByElection.set(electionId, current);
    }

    const candidaciesByElection = new Map<string, CandidacyWithCandidate[]>();
    for (const candidacy of candidacies) {
      const current = candidaciesByElection.get(candidacy.electionId) ?? [];
      current.push(candidacy);
      candidaciesByElection.set(candidacy.electionId, current);
    }

    const registeredVotersByElection = new Map<string, number>();
    for (const count of rollCounts) {
      registeredVotersByElection.set(count.electionId, count.total);
    }

    const items = rows.map((row) => ({
      election: row.election,
      statusHistory: row.election.id ? (historyByElection.get(row.election.id) ?? []) : [],
      candidacies: row.election.id ? (candidaciesByElection.get(row.election.id) ?? []) : [],
      registeredVoters: row.election.id
        ? (registeredVotersByElection.get(row.election.id) ?? 0)
        : 0,
      hasVoted: row.hasVoted,
      participationDate: row.participationDate,
    }));

    return { items, total };
  }
}
