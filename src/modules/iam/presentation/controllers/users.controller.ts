import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CreateUserDto } from '../../application/dtos/create-user.dto';
import { CreateUserUseCase } from '../../application/use-cases/create-user.use-case';
import { UserPresenter } from '../presenters/user.presenter';
import { Roles } from 'src/modules/auth/presentation/guards/roles.decorator';
import { JwtAuthGuard } from 'src/modules/auth/presentation/guards/jwt-auth.guard';
import { RolesGuard } from 'src/modules/auth/presentation/guards/roles.guard';
import { RoleName } from '../../domain/value-objects/role-name.vo';
import { UserStatus } from '../../domain/value-objects/user-status.vo';
import { DisableUserResponseDto } from '../dtos/disable-user-response.dto';
import { ListUsersQueryDto } from '../dtos/list-users-query.dto';
import { GetUsersUseCase } from '../../application/use-cases/get-users.use-case';
import { PaginatedResponseDto } from 'src/shared/pagination/paginated-response.dto';
import { GetUserUseCase } from '../../application/use-cases/get-user.use-case';
import { DisableUserUseCase } from '../../application/use-cases/disable-user.use-case';

type AuthenticatedRequest = Request & {
  user: {
    sub: string;
    email: string;
    role: RoleName;
  };
};

@Controller('users')
export class UsersController {
  constructor(
    private readonly createUser: CreateUserUseCase,
    private readonly getUsers: GetUsersUseCase,
    private readonly getUser: GetUserUseCase,
    private readonly disableUser: DisableUserUseCase,
  ) { }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR)
  async create(@Body() dto: CreateUserDto, @Req() req: AuthenticatedRequest) {
    const user = await this.createUser.execute({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      password: dto.password,
      roleId: dto.roleId,
      status: dto.status ? UserStatus.from(dto.status) : undefined,
      requestingUserId: req.user?.sub,
    });
    return UserPresenter.toResponse(user);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR, RoleName.AUDITOR)
  async list(@Query() query: ListUsersQueryDto) {
    const { users, total } = await this.getUsers.execute({
      page: query.page,
      limit: query.limit,
      search: query.search,
      role: query.role,
      status: query.status,
    });

    const data = UserPresenter.toList(users);
    return new PaginatedResponseDto({ data, total, page: query.page, limit: query.limit });
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR, RoleName.AUDITOR)
  async byId(@Param('id') id: string) {
    const user = await this.getUser.execute(id);
    return UserPresenter.toResponse(user);
  }

  @Patch(':id/disable')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR)
  async disable(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    await this.disableUser.execute(id, req.user.sub);
    return new DisableUserResponseDto('User disabled successfully');
  }
}
