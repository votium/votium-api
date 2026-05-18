import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ROLES_KEY } from './roles.decorator';
import { RoleName } from 'src/modules/users/domain/value-objects/role-name.vo';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RoleName[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request & { user: { role?: RoleName } }>();
    const user = req.user;
    if (!user?.role) throw new ForbiddenException('Missing role');
    if (!required.includes(user.role)) throw new ForbiddenException('Forbidden');
    return true;
  }
}
