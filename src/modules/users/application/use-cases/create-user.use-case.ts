import { Inject, Injectable } from '@nestjs/common';
import { ConflictError } from 'src/shared/exceptions/errors/conflict.error';
import { RoleName } from '../../domain/value-objects/role-name.vo';
import type { UserRepository } from '../../domain/repositories/user.repository.interface';
import { USER_REPOSITORY } from '../../domain/repositories/tokens';
import type { PasswordHasherPort } from '../ports/password-hasher.port';
import { PASSWORD_HASHER_PORT } from '../ports/tokens';

@Injectable()
export class CreateUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER_PORT) private readonly hasher: PasswordHasherPort,
  ) {}

  async execute(input: { name: string; email: string; password: string; role: RoleName }) {
    const existing = await this.users.findByEmail(input.email);
    if (existing) throw new ConflictError('El email ya esta en uso');
    const passwordHash = await this.hasher.hash(input.password);
    return this.users.create({
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
    });
  }
}
