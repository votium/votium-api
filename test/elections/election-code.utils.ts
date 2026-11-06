import type { PrismaService } from '../../src/shared/database/prisma.service';
import { PrismaElectionRepository } from '../../src/modules/elections/infrastructure/repositories/prisma-election.repository';

// Allocates a real election code through the production counter so directly-seeded
// elections never collide, even across test files sharing the same database.
export function nextTestElectionCode(prisma: PrismaService): Promise<string> {
  return new PrismaElectionRepository(prisma).nextElectionCode();
}
