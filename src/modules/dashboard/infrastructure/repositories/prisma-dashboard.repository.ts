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
      // Exclude MFA/session events: they are authentication noise, not meaningful
      // system activity (documented deviation from spec §16/§17 "latest records").
      where: { action: { notIn: MFA_ACTIONS } },
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      take: limit,
      select: {
        action: true,
        details: true,
        timestamp: true,
        user: { select: { first_name: true, last_name: true } },
      },
    });

    const mapped = rows.map((row) => {
      const details = parseDetails(row.details);
      const resourceType = mapActionToResourceType(row.action);
      return {
        action: row.action,
        resourceType,
        resourceId: extractResourceId(details, resourceType),
        userName: `${row.user.first_name} ${row.user.last_name}`.trim(),
        occurredAt: row.timestamp,
      };
    });

    const resourceNames = await this.resolveResourceNames(mapped);

    return mapped.map((row) => ({
      action: row.action,
      resourceType: row.resourceType,
      resourceName: row.resourceId ? (resourceNames.get(row.resourceId) ?? '') : '',
      userName: row.userName,
      occurredAt: row.occurredAt,
    }));
  }

  // Resolves human-readable resource names from the id stored in the audit-log
  // `details`, via batched lookups (at most one query per entity, no N+1). The
  // audit table has no resource FK, so the id in `details` is the only linkage.
  private async resolveResourceNames(
    rows: ReadonlyArray<{ resourceType: string; resourceId: string | null }>,
  ): Promise<Map<string, string>> {
    const electionIds = new Set<string>();
    const candidateIds = new Set<string>();
    const electorIds = new Set<string>();
    const userIds = new Set<string>();

    for (const row of rows) {
      if (!row.resourceId) continue;
      const entity = RESOURCE_NAME_CONFIG[row.resourceType]?.entity;
      if (entity === 'election') electionIds.add(row.resourceId);
      else if (entity === 'candidate') candidateIds.add(row.resourceId);
      else if (entity === 'elector') electorIds.add(row.resourceId);
      else if (entity === 'user') userIds.add(row.resourceId);
    }

    const names = new Map<string, string>();

    if (electionIds.size > 0) {
      const found = await this.prisma.election.findMany({
        where: { id: { in: [...electionIds] } },
        select: { id: true, name: true },
      });
      for (const item of found) names.set(item.id, item.name);
    }

    if (candidateIds.size > 0) {
      collectPersonNames(
        names,
        await this.prisma.candidate.findMany({
          where: { id: { in: [...candidateIds] } },
          select: { id: true, first_name: true, last_name: true },
        }),
      );
    }

    if (electorIds.size > 0) {
      collectPersonNames(
        names,
        await this.prisma.elector.findMany({
          where: { id: { in: [...electorIds] } },
          select: { id: true, first_name: true, last_name: true },
        }),
      );
    }

    if (userIds.size > 0) {
      collectPersonNames(
        names,
        await this.prisma.user.findMany({
          where: { id: { in: [...userIds] } },
          select: { id: true, first_name: true, last_name: true },
        }),
      );
    }

    return names;
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
// from the action prefix; the resource name is later resolved from the id stored in
// `details` (see RESOURCE_NAME_CONFIG), never fabricated.
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

// Auth/session events excluded from "recent activity": they are operational noise
// (logins, OTP) rather than dashboard-relevant system activity. Keeping the action
// set here makes the filter auditable and easy to extend.
const MFA_ACTIONS = ['MFA_OTP_SENT', 'MFA_RESEND', 'MFA_VERIFY_SUCCESS', 'MFA_VERIFY_FAILED'];

// Maps a resource type to the `details` keys that carry its id, and to the entity
// whose current record supplies the display name. Types without a resolvable name
// (Mfa) or without an entry (Unknown) resolve to an empty name.
type NameableEntity = 'election' | 'candidate' | 'elector' | 'user';

interface ResourceNameResolution {
  idKeys: string[];
  entity?: NameableEntity;
}

const RESOURCE_NAME_CONFIG: Record<string, ResourceNameResolution> = {
  Election: { idKeys: ['electionId'], entity: 'election' },
  Candidate: { idKeys: ['candidateId'], entity: 'candidate' },
  // A candidacy has no name of its own; its display name is the candidate's.
  Candidacy: { idKeys: ['candidateId'], entity: 'candidate' },
  Elector: { idKeys: ['electorId'], entity: 'elector' },
  User: { idKeys: ['targetUserId', 'userId'], entity: 'user' },
  Mfa: { idKeys: ['sessionId'] },
  // An electoral roll has no name; its display name is the election's.
  ElectoralRoll: { idKeys: ['electionId'], entity: 'election' },
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

function extractResourceId(
  details: Record<string, unknown> | null,
  resourceType: string,
): string | null {
  if (!details) return null;
  const config = RESOURCE_NAME_CONFIG[resourceType];
  if (!config) return null;
  for (const key of config.idKeys) {
    const value = details[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

function collectPersonNames(
  names: Map<string, string>,
  rows: Array<{ id: string; first_name: string; last_name: string }>,
): void {
  for (const row of rows) {
    names.set(row.id, `${row.first_name} ${row.last_name}`.trim());
  }
}
