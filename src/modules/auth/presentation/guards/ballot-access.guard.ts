/* USO

Proteger el endpoint del ballot electoral:

  import { JwtAuthGuard } from './jwt-auth.guard';
  import { BallotAccessGuard } from './ballot-access.guard';

  @UseGuards(JwtAuthGuard, BallotAccessGuard)
  @Get(':electionId/ballot')
  ...

Siempre usar AMBOS guards: JwtAuthGuard primero (autentica y valida el JWT),
BallotAccessGuard después (autoriza). El guard acepta tokens de usuario con
rol ADMINISTRATOR o AUDITOR y tokens de elector (actorType 'ELECTOR'), que no
llevan claim `role`. Cualquier otro principal es rechazado.
*/

import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { RoleName } from 'src/modules/iam/domain/value-objects/role-name.vo';

@Injectable()
export class BallotAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: { actorType?: string; role?: string } }>();
    const actorType = req.user?.actorType;
    const role = req.user?.role;

    // VOTER path: elector tokens carry actorType 'ELECTOR' and no role claim.
    // Comparación exacta y sensible a mayúsculas, como ElectorGuard.
    if (actorType === 'ELECTOR') {
      return true;
    }

    // ADMIN and AUDITOR path: user tokens carry a role claim.
    if (role === RoleName.ADMINISTRATOR.value || role === RoleName.AUDITOR.value) {
      return true;
    }

    throw new ForbiddenException('Requires ADMINISTRATOR, AUDITOR, or VOTER access');
  }
}
