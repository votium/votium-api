import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/shared/database/prisma.service';
import type {
  MfaChallengeCreateInput,
  MfaChallengeRepository,
} from '../../domain/repositories/mfa-challenge.repository.interface';
import { MfaChallengeEntity } from '../../domain/entities/mfa-challenge.entity';
import { PrismaMfaChallengeMapper } from '../mappers/prisma-mfa-challenge.mapper';

@Injectable()
export class PrismaMfaChallengeRepository implements MfaChallengeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: MfaChallengeCreateInput): Promise<MfaChallengeEntity> {
    const row = await this.prisma.mfaChallenge.create({
      data: {
        user_id: input.userId,
        session_id: input.sessionId,
        otp_hash: input.otpHash,
        attempts: 0,
        expires_at: input.expiresAt,
        resend_at: input.resendAt,
      },
    });
    return PrismaMfaChallengeMapper.toDomain(row);
  }

  async findBySessionId(sessionId: string): Promise<MfaChallengeEntity | null> {
    const row = await this.prisma.mfaChallenge.findUnique({
      where: { session_id: sessionId },
    });
    return row ? PrismaMfaChallengeMapper.toDomain(row) : null;
  }

  async save(challenge: MfaChallengeEntity): Promise<void> {
    await this.prisma.mfaChallenge.update({
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
    await this.prisma.mfaChallenge.deleteMany({
      where: { session_id: sessionId },
    });
  }

  async invalidateByUserId(userId: string): Promise<void> {
    await this.prisma.mfaChallenge.deleteMany({
      where: { user_id: userId },
    });
  }
}
