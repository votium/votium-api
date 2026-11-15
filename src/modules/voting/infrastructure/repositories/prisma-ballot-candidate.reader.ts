import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/shared/database/prisma.service'; // ajusta la ruta
import {
  type BallotCandidateExtra,
  BallotCandidateReader,
} from '../../domain/repositories/ballot-candidate.reader';

@Injectable()
export class PrismaBallotCandidateReader extends BallotCandidateReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findByElection(electionId: string): Promise<BallotCandidateExtra[]> {
    const rows = await this.prisma.candiday.findMany({
      where: { election_id: electionId },
      select: {
        id: true,
        position_number: true,
        image_url: true,
      },
    });
    return rows.map((r) => ({
      candidateId: r.id,
      photoUrl: r.image_url,
      position: String(r.position_number),
    }));
  }
}
