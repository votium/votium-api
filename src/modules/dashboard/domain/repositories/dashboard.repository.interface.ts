import type { ElectionStatus } from 'src/modules/elections/domain/entities/election.entity';

export const DASHBOARD_REPOSITORY = 'DashboardRepository';

// The five lifecycle-state counts in response (lowercase) form. Every key is
// always present; a state with no elections is `0`.
export interface ElectionStatusCounts {
  pending: number;
  created: number;
  active: number;
  closed: number;
  published: number;
}

// Raw group-by result keyed by the persisted `ElectionStatus` value. Only states
// that actually have rows are present; the application layer normalizes this into
// the zero-filled `ElectionStatusCounts` (mapping enum value -> response key).
export type ElectionStatusCountMap = Partial<Record<ElectionStatus, number>>;

export interface UpcomingElectionWindow {
  // Inclusive lower bound (exclusive for an election whose start equals `from`).
  from: Date;
  // Inclusive upper bound.
  to: Date;
}

export interface UpcomingElectionRow {
  id: string;
  name: string;
  startDate: Date;
  startTime: Date;
  electoralRollCount: number;
  candidacyCount: number;
}

export interface RecentActivityRow {
  action: string;
  resourceType: string;
  resourceName: string;
  userName: string;
  occurredAt: Date;
}

// Read-only query port that aggregates read data across the election, candidate,
// elector and audit-log contexts for the administrative dashboard. It never
// modifies any persisted data.
export interface DashboardRepository {
  countElections(): Promise<number>;
  countCandidates(): Promise<number>;
  countElectors(): Promise<number>;
  countElectionsByStatus(): Promise<ElectionStatusCountMap>;
  findUpcomingElections(window: UpcomingElectionWindow): Promise<UpcomingElectionRow[]>;
  findRecentActivity(limit: number): Promise<RecentActivityRow[]>;
}
