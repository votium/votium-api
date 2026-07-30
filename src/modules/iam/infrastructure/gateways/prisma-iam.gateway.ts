import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/shared/database/prisma.service';
import {
  PASSWORD_HASHER_PORT,
  type PasswordHasherPort,
} from '../../application/ports/password-hasher.port';
import type {
  IamGateway,
  UserCredentials,
} from 'src/modules/auth/application/ports/iam.gateway.port';

@Injectable()
export class PrismaIamGateway implements IamGateway {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PASSWORD_HASHER_PORT) private readonly hasher: PasswordHasherPort,
  ) {}

  async validateCredentials(email: string, password: string): Promise<UserCredentials | null> {
    const row = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: { role: true },
    });

    if (!row) return null;
    if (row.status === 'DISABLED') return null;

    const valid = await this.hasher.verify(password, row.password_hash);
    if (!valid) return null;

    return {
      id: row.id,
      email: row.email,
      role: row.role.name,
    };
  }
}
