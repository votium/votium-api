import { Injectable } from '@nestjs/common';

import { ResultsRepository } from '../../domain/repositories/results.repository.interface';
import { ResultEntity } from '../../domain/entities/result.entity';
import { ELECTION_STATUS_VALUES } from '../../domain/value-objects/election-status.vo';
import { PrismaService } from 'src/shared/database/prisma.service';

@Injectable()
export class PrismaResultsRepository implements ResultsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getResults(electionId: string): Promise<ResultEntity | null> {
    const resultsRow = await this.prisma.result.findMany({
      where: {
        election_id: electionId,
        election: {
          current_status: ELECTION_STATUS_VALUES[4],
        },
      },
      select: {
        votes: true,
        candidacy: {
          select: {
            candidate_id: true,
            candidate: {
              select: {
                first_name: true,
                last_name: true,
              },
            },
          },
        },
        election: {
          select: {
            current_status: true,
          },
        },
      },
    });

    if (resultsRow.length === 0) {
      return null;
    }

    let total = 0;
    const candidacies = new Map<string, { candidateId: string; name: string; votes: number }>();

    for (const row of resultsRow) {
      const { candidate_id, candidate } = row.candidacy;

      candidacies.set(candidate_id, {
        candidateId: candidate_id,
        name: `${candidate.first_name} ${candidate.last_name}`.trim(),
        votes: row.votes,
      });

      total += row.votes;
    }

    return ResultEntity.restore({
      electionId,
      total,
      electionStatus: resultsRow[0].election.current_status,
      candidacies: Array.from(candidacies.values()),
    });
  }
}
