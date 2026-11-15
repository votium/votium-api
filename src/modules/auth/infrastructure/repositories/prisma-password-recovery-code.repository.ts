import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/shared/database/prisma.service';
import { MAX_PASSWORD_RECOVERY_ATTEMPTS } from 'src/shared/constants/password-recovery.constants';
import type {
  ConsumeRecoveryCodeOutcome,
  PasswordRecoveryCodeRepository,
} from '../../domain/repositories/password-recovery-code.repository.interface';
import { PrismaPasswordRecoveryCodeMapper } from '../mappers/prisma-password-recovery-code.mapper';

// Thrown inside the transaction to roll it back when the account is no longer active,
// so the code is not left consumed. Never leaves this repository.
class AccountUnavailableRollback extends Error {}

@Injectable()
export class PrismaPasswordRecoveryCodeRepository implements PasswordRecoveryCodeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async replaceActive(input: { userId: string; codeHash: string; expiresAt: Date }): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.passwordRecoveryCode.deleteMany({ where: { user_id: input.userId } }),
      this.prisma.passwordRecoveryCode.create({
        data: { user_id: input.userId, code_hash: input.codeHash, expires_at: input.expiresAt },
      }),
    ]);
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.prisma.passwordRecoveryCode.deleteMany({ where: { user_id: userId } });
  }

  async findActiveCreatedAt(userId: string, now: Date): Promise<Date | null> {
    const row = await this.prisma.passwordRecoveryCode.findFirst({
      where: { user_id: userId, consumed_at: null, expires_at: { gt: now } },
      orderBy: { created_at: 'desc' },
      select: { created_at: true },
    });
    return row?.created_at ?? null;
  }

  async consumeAndResetPassword(input: {
    userId: string;
    codeHash: string;
    passwordHash: string;
    now: Date;
  }): Promise<ConsumeRecoveryCodeOutcome> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.passwordRecoveryCode.findFirst({
          where: { user_id: input.userId },
          orderBy: { created_at: 'desc' },
        });
        if (!row) return 'invalid';

        const code = PrismaPasswordRecoveryCodeMapper.toDomain(row);
        if (code.isConsumed()) return 'used';
        if (code.isExpired(input.now)) return 'expired';
        if (code.hasExceededAttempts(MAX_PASSWORD_RECOVERY_ATTEMPTS)) {
          await tx.passwordRecoveryCode.delete({ where: { id: code.id } });
          return 'attempts_exceeded';
        }

        if (code.codeHash !== input.codeHash) {
          code.registerFailedAttempt();
          if (code.hasExceededAttempts(MAX_PASSWORD_RECOVERY_ATTEMPTS)) {
            await tx.passwordRecoveryCode.delete({ where: { id: code.id } });
          } else {
            await tx.passwordRecoveryCode.update({
              where: { id: code.id },
              data: { attempts: code.attempts },
            });
          }
          return 'invalid';
        }

        // Conditional consumption: a concurrent reset that already consumed the code makes
        // this match 0 rows.
        const consumed = await tx.passwordRecoveryCode.updateMany({
          where: {
            id: code.id,
            consumed_at: null,
            code_hash: input.codeHash,
            expires_at: { gt: input.now },
          },
          data: { consumed_at: input.now },
        });
        if (consumed.count === 0) return 'used';

        const updated = await tx.user.updateMany({
          where: { id: input.userId, deleted_at: null, status: 'ACTIVE' },
          data: { password_hash: input.passwordHash },
        });
        if (updated.count === 0) throw new AccountUnavailableRollback();

        return 'updated';
      });
    } catch (error) {
      if (error instanceof AccountUnavailableRollback) return 'invalid';
      throw error;
    }
  }
}
