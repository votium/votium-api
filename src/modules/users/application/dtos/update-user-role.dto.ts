import { IsEnum } from "class-validator";
import { RoleName } from "../../domain/value-objects/role-name.vo";

export class UpdateUserRoleDto {
  @IsEnum(RoleName)
  role!: RoleName;
}
