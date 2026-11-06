/* EJEMPLO DE USO

Proteger un endpoint del área elector:

  import { JwtAuthGuard } from "./presentation/guards/jwt-auth.guard";
  import { ElectorGuard } from "./presentation/guards/elector.guard";

  @UseGuards(JwtAuthGuard, ElectorGuard)
  @Get("mi-endpoint")
  soloElector() { ... }

Siempre usar AMBOS guards: JwtAuthGuard primero (autentica y valida el JWT),
ElectorGuard después (autoriza por actorType). El guard lee el `actorType`
del payload JWT ya validado (req.user) y solo permite el valor exacto 'ELECTOR'.
*/

import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class ElectorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user?: { actorType?: string } }>();
    const actorType = req.user?.actorType;
    // Comparación exacta y sensible a mayúsculas. Solo se acepta 'ELECTOR'.
    if (actorType !== 'ELECTOR') {
      throw new ForbiddenException('Requires elector actor type');
    }
    return true;
  }
}
