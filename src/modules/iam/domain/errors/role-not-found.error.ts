import { NotFoundException } from 'src/shared/exceptions/base/not-found.exception';

export class RoleNotFoundError extends NotFoundException {
  constructor(role: string) {
    super('Rol', role, 'ROLE_NOT_FOUND');
  }
}
