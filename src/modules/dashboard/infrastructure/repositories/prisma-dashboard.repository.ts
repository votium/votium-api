import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../../generated/prisma/client';
import { PrismaService } from 'src/shared/database/prisma.service';
import {
  type DashboardRepository,
  type ElectionStatusCountMap,
  type RecentActivityRow,
  type UpcomingElectionRow,
  type UpcomingElectionWindow,
} from '../../domain/repositories/dashboard.repository.interface';

@Injectable()
export class PrismaDashboardRepository implements DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  async countElections(): Promise<number> {
    return this.prisma.election.count();
  }

  async countCandidates(): Promise<number> {
    // Exclude only logically deleted candidates; ACTIVE and INACTIVE both count.
    return this.prisma.candidate.count({ where: { deleted_at: null } });
  }

  async countElectors(): Promise<number> {
    // Exclude only logically deleted electors; ACTIVE and INACTIVE both count.
    return this.prisma.elector.count({ where: { deleted_at: null } });
  }

  async countElectionsByStatus(): Promise<ElectionStatusCountMap> {
    const groups = await this.prisma.election.groupBy({
      by: ['current_status'],
      _count: { _all: true },
    });

    const result: ElectionStatusCountMap = {};
    for (const group of groups) {
      result[group.current_status] = group._count._all;
    }
    return result;
  }

  async findUpcomingElections(window: UpcomingElectionWindow): Promise<UpcomingElectionRow[]> {
    const { from, to } = window;

    // Mirror the existing schedule-window semantics (UTC, inclusive upper bound)
    // used by `buildActiveFilter` in the elections repository: the start instant is
    // `start_date + start_time`. "Upcoming" means `now < startDateTime <= now + days`.
    const fromDate = currentElectionDate(from);
    const fromTime = currentElectionTime(from);
    const toDate = currentElectionDate(to);
    const toTime = currentElectionTime(to);

    const notStartedYet: Prisma.ElectionWhereInput = {
      OR: [
        { start_date: { gt: fromDate } },
        { AND: [{ start_date: fromDate }, { start_time: { gt: fromTime } }] },
      ],
    };
    const withinUpperBound: Prisma.ElectionWhereInput = {
      OR: [
        { start_date: { lt: toDate } },
        { AND: [{ start_date: toDate }, { start_time: { lte: toTime } }] },
      ],
    };

    const rows = await this.prisma.election.findMany({
      where: { AND: [notStartedYet, withinUpperBound] },
      orderBy: [{ start_date: 'asc' }, { start_time: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        name: true,
        start_date: true,
        start_time: true,
        _count: { select: { electoralRolls: true, candidacies: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      startDate: row.start_date,
      startTime: row.start_time,
      electoralRollCount: row._count.electoralRolls,
      candidacyCount: row._count.candidacies,
    }));
  }

  async findRecentActivity(limit: number): Promise<RecentActivityRow[]> {
    const rows = await this.prisma.auditLog.findMany({
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      take: limit,
      select: {
        action: true,
        details: true,
        timestamp: true,
        user: { select: { first_name: true, last_name: true } },
      },
    });

    return rows.map((row) => {
      const details = parseDetails(row.details);
      const resourceType = mapActionToResourceType(row.action);
      return {
        action: row.action,
        resourceType,
        resourceName: extractResourceName(details, resourceType),
        userName: `${row.user.first_name} ${row.user.last_name}`.trim(),
        occurredAt: row.timestamp,
      };
    });
  }
}

// Mirrors `currentElectionDate`/`currentElectionTime` in the elections repository:
// UTC midnight for the calendar date, and the time-of-day expressed on the epoch.
function currentElectionDate(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function currentElectionTime(now: Date): Date {
  return new Date(
    Date.UTC(1970, 0, 1, now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds()),
  );
}

// The audit-log table stores only `action` + free-form `details` JSON; there is no
// authoritative resource type/name column. This map derives a display resource type
// from the action prefix, and a best-effort resource name from the id present in
// `details` (never a fabricated human name).
const ACTION_RESOURCE_TYPE: Record<string, string> = {
  ELECTION_CREATED: 'Election',
  ELECTION_UPDATED: 'Election',
  ELECTION_DELETED: 'Election',
  ELECTION_STATUS_CHANGED: 'Election',
  CANDIDATE_REGISTERED: 'Candidate',
  CANDIDATE_UPDATED: 'Candidate',
  CANDIDATE_DELETED: 'Candidate',
  CANDIDATE_DEACTIVATED: 'Candidate',
  CANDIDATE_REACTIVATED: 'Candidate',
  CANDIDACY_REGISTERED: 'Candidacy',
  CANDIDACY_UPDATED: 'Candidacy',
  CANDIDACY_DELETED: 'Candidacy',
  ELECTOR_UPDATED: 'Elector',
  ELECTOR_DELETED: 'Elector',
  ELECTOR_DEACTIVATED: 'Elector',
  ELECTOR_ACTIVATED: 'Elector',
  USER_CREATED: 'User',
  USER_ACTIVATED: 'User',
  USER_DEACTIVATED: 'User',
  USER_DELETED: 'User',
  MFA_OTP_SENT: 'Mfa',
  MFA_RESEND: 'Mfa',
  MFA_VERIFY_SUCCESS: 'Mfa',
  MFA_VERIFY_FAILED: 'Mfa',
  BULK_REGISTER_ELECTORAL_ROLL: 'ElectoralRoll',
  MANUAL_REGISTER_ELECTORAL_ROLL: 'ElectoralRoll',
  ELECTORAL_ROLL_ELECTOR_UPDATED: 'ElectoralRoll',
  ELECTORAL_ROLL_ELECTOR_REMOVED: 'ElectoralRoll',
};

const RESOURCE_NAME_KEYS: Record<string, string[]> = {
  Election: ['electionId'],
  Candidate: ['candidateId'],
  Candidacy: ['candidacyId'],
  Elector: ['electorId'],
  User: ['targetUserId', 'userId'],
  Mfa: ['sessionId'],
  ElectoralRoll: ['electionId'],
};

function mapActionToResourceType(action: string): string {
  return ACTION_RESOURCE_TYPE[action] ?? 'Unknown';
}

function parseDetails(details: string | null): Record<string, unknown> | null {
  if (!details) return null;
  try {
    const parsed: unknown = JSON.parse(details);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function extractResourceName(
  details: Record<string, unknown> | null,
  resourceType: string,
): string {
  if (!details) return '';
  const keys = RESOURCE_NAME_KEYS[resourceType] ?? [];
  for (const key of keys) {
    const value = details[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return '';
}
