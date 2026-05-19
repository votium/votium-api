import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CreateUserDto } from '../../application/dtos/create-user.dto';
import { UpdateUserRoleDto } from '../../application/dtos/update-user-role.dto';
import { CreateUserUseCase } from '../../application/use-cases/create-user.use-case';
import { UpdateUserRoleUseCase } from '../../application/use-cases/update-user-role.use-case';
import { ListUsersUseCase } from '../../application/use-cases/list-users.use-case';
import { UserMapper } from '../../application/mappers/user.mapper';
import { JwtAuthGuard } from 'src/modules/auth/presentation/guards/jwt-auth.guard';
import { RolesGuard } from 'src/modules/auth/presentation/guards/roles.guard';
import { Roles } from 'src/modules/auth/presentation/guards/roles.decorator';
import { RoleName } from '../../domain/value-objects/role-name.vo';

@Controller('users')
export class UsersController {
  constructor(
    private readonly createUser: CreateUserUseCase,
    private readonly updateUserRole: UpdateUserRoleUseCase,
    private readonly listUsers: ListUsersUseCase,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRADOR)
  async list() {
    const users = await this.listUsers.execute();
    return UserMapper.toResponseList(users);
  }

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

  @Patch(':id/role')
  async setRole(@Param('id') id: string, @Body() dto: UpdateUserRoleDto) {
    const user = await this.updateUserRole.execute(id, dto.role);
    return UserMapper.toResponse(user);
  }
}
