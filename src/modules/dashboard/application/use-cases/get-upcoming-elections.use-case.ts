import { ElectionEntity } from 'src/modules/elections/domain/entities/election.entity';
import type { DashboardRepository } from '../../domain/repositories/dashboard.repository.interface';

export interface UpcomingElectionResult {
  name: string;
  startDate: Date;
  timeUntilStart: string;
  configurationPercentage: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export class GetUpcomingElectionsUseCase {
  constructor(private readonly dashboard: DashboardRepository) {}

  async execute(input: { days: number; now?: Date }): Promise<UpcomingElectionResult[]> {
    const now = input.now ?? new Date();
    const to = new Date(now.getTime() + input.days * MS_PER_DAY);

    const rows = await this.dashboard.findUpcomingElections({ from: now, to });

    return rows.map((row) => {
      // Single authoritative date+time combination (UTC), reused from the election
      // domain. The same instant drives `startDate`, `timeUntilStart` and filtering.
      const startInstant = ElectionEntity.toInstant(row.startDate, row.startTime);

      return {
        name: row.name,
        startDate: new Date(startInstant),
        timeUntilStart: formatTimeUntilStart(startInstant - now.getTime()),
        configurationPercentage: deriveConfigurationPercentage(
          row.electoralRollCount,
          row.candidacyCount,
        ),
      };
    });
  }
}

// Configuration readiness derived strictly from the two existing finalization
// prerequisites (electoral roll present + at least one candidacy). No other
// weighting is invented: both satisfied = 100, exactly one = 50, neither = 0.
function deriveConfigurationPercentage(electoralRollCount: number, candidacyCount: number): number {
  const hasRoll = electoralRollCount > 0;
  const hasCandidates = candidacyCount > 0;
  if (hasRoll && hasCandidates) return 100;
  if (hasRoll || hasCandidates) return 50;
  return 0;
}

// Human-readable relative duration `Xd Yh Zm` (days/hours/minutes), deterministically
// derived from the remaining milliseconds. Minutes are the finest granularity.
function formatTimeUntilStart(milliseconds: number): string {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  return `${days}d ${hours}h ${minutes}m`;
}
