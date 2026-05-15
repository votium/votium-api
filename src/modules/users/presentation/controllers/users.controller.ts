import { Body, Controller, Param, Patch, Post } from "@nestjs/common";
import { CreateUserDto } from "../../application/dtos/create-user.dto";
import { UpdateUserRoleDto } from "../../application/dtos/update-user-role.dto";
import { CreateUserUseCase } from "../../application/use-cases/create-user.use-case";
import { UpdateUserRoleUseCase } from "../../application/use-cases/update-user-role.use-case";
import { UserMapper } from "../../application/mappers/user.mapper";

@Controller("users")
export class UsersController {
  constructor(
    private readonly createUser: CreateUserUseCase,
    private readonly updateUserRole: UpdateUserRoleUseCase,
  ) {}

  @Post()
  async create(@Body() dto: CreateUserDto) {
    const user = await this.createUser.execute({
      name: dto.name,
      email: dto.email,
      password: dto.password,
      role: dto.role,
    });
    return UserMapper.toResponse(user);
  }

  @Patch(":id/role")
  async setRole(@Param("id") id: string, @Body() dto: UpdateUserRoleDto) {
    const user = await this.updateUserRole.execute(id, dto.role);
    return UserMapper.toResponse(user);
  }
}
