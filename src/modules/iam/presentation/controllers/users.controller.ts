import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
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
import { UserResponseDto } from '../dtos/user-response.dto';
import { UsersListResponseDto } from '../dtos/users-list-response.dto';
import { GetUsersUseCase } from '../../application/use-cases/get-users.use-case';
import { PaginatedResponseDto } from 'src/shared/pagination/paginated-response.dto';
import { GetUserUseCase } from '../../application/use-cases/get-user.use-case';
import { DisableUserUseCase } from '../../application/use-cases/disable-user.use-case';
import { MeUserResponseDto } from '../dtos/me-user-response.dto';

type AuthenticatedRequest = Request & {
  user: {
    sub: string;
    email: string;
    role: RoleName;
  };
};

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(
    private readonly createUser: CreateUserUseCase,
    private readonly getUsers: GetUsersUseCase,
    private readonly getUser: GetUserUseCase,
    private readonly disableUser: DisableUserUseCase,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR)
  @ApiOperation({
    summary: 'Create a user',
    description: 'Creates a new user. Requires ADMINISTRATOR role.',
  })
  @ApiResponse({ status: 201, description: 'User created successfully.', type: UserResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid request data.' })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR role.' })
  @ApiResponse({ status: 409, description: 'Email already registered.' })
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
  @ApiOperation({
    summary: 'List users',
    description: 'Returns a paginated list of users. Requires ADMINISTRATOR or AUDITOR role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Users retrieved successfully.',
    type: UsersListResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid query parameters.' })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR or AUDITOR role.' })
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

  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR, RoleName.AUDITOR)
  @ApiOperation({
    summary: 'Get currently authenticated user',
    description:
      'Returns the authenticated administrator or auditor resolved from the JWT. ' +
      'Requires ADMINISTRATOR or AUDITOR role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Authenticated user retrieved successfully.',
    type: MeUserResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR or AUDITOR role.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async me(@Req() req: AuthenticatedRequest) {
    const user = await this.getUser.execute(req.user.sub);
    return UserPresenter.toMeResponse(user);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR, RoleName.AUDITOR)
  @ApiOperation({
    summary: 'Get user by id',
    description:
      'Returns a single user by its unique identifier. Requires ADMINISTRATOR or AUDITOR role.',
  })
  @ApiParam({ name: 'id', description: 'Unique identifier of the user.', example: 'uuid' })
  @ApiResponse({ status: 200, description: 'User retrieved successfully.', type: UserResponseDto })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR or AUDITOR role.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async byId(@Param('id') id: string) {
    const user = await this.getUser.execute(id);
    return UserPresenter.toResponse(user);
  }

  @Patch(':id/disable')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR)
  @ApiOperation({
    summary: 'Disable a user',
    description: 'Disables a user. Requires ADMINISTRATOR. Self-disable is rejected.',
  })
  @ApiParam({ name: 'id', description: 'Unique identifier of the user.', example: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'User disabled successfully.',
    type: DisableUserResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR role.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  @ApiResponse({ status: 409, description: 'Self-disable is not allowed.' })
  async disable(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    await this.disableUser.execute(id, req.user.sub);
    return new DisableUserResponseDto('User disabled successfully');
  }
}
