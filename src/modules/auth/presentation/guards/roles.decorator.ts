/* EJEMPLO DE USO

Proteger un endpoint para uno o varios roles:

  import { Roles } from "./presentation/guards/roles.decorator";
  import { JwtAuthGuard } from "./presentation/guards/jwt-auth.guard";
  import { RolesGuard } from "./presentation/guards/roles.guard";

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRADOR)
  @Post("algun-endpoint")
  soloAdmin() { ... }

Siempre usar AMBOS guards: JwtAuthGuard primero (autentica),
RolesGuard después (autoriza).

Puedes pasar varios roles:
  @Roles(RoleName.ADMINISTRADOR, RoleName.AUDITOR)
  → cualquiera de ellos puede acceder.
*/

import { SetMetadata } from "@nestjs/common";
import { RoleName } from "src/modules/users/domain/value-objects/role-name.vo";

export const ROLES_KEY = "roles";
export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);
