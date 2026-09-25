import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/shared/database/prisma.service';
import { ElectorMfaChallengeEntity } from '../../domain/entities/elector-mfa-challenge.entity';
import type {
  ElectorMfaChallengeCreateInput,
  ElectorMfaChallengeRepository,
} from '../../domain/repositories/elector-mfa-challenge.repository.interface';
import { PrismaElectorMfaChallengeMapper } from '../mappers/prisma-elector-mfa-challenge.mapper';

@Injectable()
export class PrismaElectorMfaChallengeRepository implements ElectorMfaChallengeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: ElectorMfaChallengeCreateInput): Promise<ElectorMfaChallengeEntity> {
    const row = await this.prisma.electorMfaChallenge.create({
      data: {
        elector_id: input.electorId,
        session_id: input.sessionId,
        otp_hash: input.otpHash,
        attempts: 0,
        expires_at: input.expiresAt,
        resend_at: input.resendAt,
      },
    });
    return PrismaElectorMfaChallengeMapper.toDomain(row);
  }

  async findBySessionId(sessionId: string): Promise<ElectorMfaChallengeEntity | null> {
    const row = await this.prisma.electorMfaChallenge.findUnique({
      where: { session_id: sessionId },
    });
    return row ? PrismaElectorMfaChallengeMapper.toDomain(row) : null;
  }

  async save(challenge: ElectorMfaChallengeEntity): Promise<void> {
    await this.prisma.electorMfaChallenge.update({
      where: { id: challenge.id },
      data: {
        otp_hash: challenge.otpHash,
        attempts: challenge.attempts,
        expires_at: challenge.expiresAt,
        resend_at: challenge.resendAt,
        consumed_at: challenge.consumedAt,
      },
    });
  }

  async deleteBySessionId(sessionId: string): Promise<void> {
    await this.prisma.electorMfaChallenge.deleteMany({
      where: { session_id: sessionId },
    });
  }

  async invalidateByElectorId(electorId: string): Promise<void> {
    await this.prisma.electorMfaChallenge.deleteMany({
      where: { elector_id: electorId },
    });
  }
}
