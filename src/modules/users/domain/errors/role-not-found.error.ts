import { NotFoundError } from "src/shared/exceptions/errors/not-found.error";
import { RoleName } from "../value-objects/role-name.vo";

export class RoleNotFoundError extends NotFoundError {
  constructor(role: RoleName) {
    super("Rol", role);
  }
}
