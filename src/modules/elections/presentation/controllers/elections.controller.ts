import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { PaginatedResponseDto } from 'src/shared/pagination/paginated-response.dto';
import { JwtAuthGuard } from 'src/modules/auth/presentation/guards/jwt-auth.guard';
import { Roles } from 'src/modules/auth/presentation/guards/roles.decorator';
import { RolesGuard } from 'src/modules/auth/presentation/guards/roles.guard';
import { RoleName } from 'src/modules/iam/domain/value-objects/role-name.vo';
import { CreateElectionDto } from '../../application/dtos/create-election.dto';
import { UpdateElectionDto } from '../../application/dtos/update-election.dto';
import { CreateElectionUseCase } from '../../application/use-cases/create-election.use-case';
import { GetElectionsUseCase } from '../../application/use-cases/get-elections.use-case';
import { UpdateElectionUseCase } from '../../application/use-cases/update-election.use-case';
import { DeleteElectionUseCase } from '../../application/use-cases/delete-election.use-case';
import { ElectionPresenter } from '../presenters/election.presenter';
import { ElectionResponseDto } from '../dtos/election-response.dto';
import { ElectionsListResponseDto } from '../dtos/elections-list-response.dto';
import { ListElectionsQueryDto } from '../dtos/list-elections-query.dto';

type AuthenticatedRequest = Request & {
  user: {
    sub: string;
    email: string;
    role: RoleName;
  };
};

@ApiTags('elections')
@ApiBearerAuth()
@Controller('elections')
export class ElectionsController {
  constructor(
    private readonly getElections: GetElectionsUseCase,
    private readonly createElection: CreateElectionUseCase,
    private readonly updateElection: UpdateElectionUseCase,
    private readonly deleteElection: DeleteElectionUseCase,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR, RoleName.AUDITOR)
  @ApiOperation({
    summary: 'Query elections',
    description:
      'Returns a paginated list of elections with optional filters (status, name, ' +
      'startDate, endDate, active). Defaults to schedule-active elections. Requires ' +
      'ADMINISTRATOR or AUDITOR role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Elections retrieved successfully.',
    type: ElectionsListResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid query parameters.' })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR or AUDITOR role.' })
  async list(@Query() query: ListElectionsQueryDto) {
    const { elections, total } = await this.getElections.execute({
      page: query.page,
      limit: query.limit,
      name: query.name,
      status: query.status,
      startDate: query.startDate,
      endDate: query.endDate,
      active: query.active,
    });

    const data = ElectionPresenter.toList(elections);
    return new PaginatedResponseDto({ data, total, page: query.page, limit: query.limit });
  }

  @Post()
  @ApiOperation({
    summary: 'Create a new election',
    description: 'Creates an election. Requires ADMINISTRATOR role.',
  })
  @ApiResponse({
    status: 201,
    description: 'Election created successfully.',
    type: ElectionResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request data.' })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR role.' })
  @ApiResponse({ status: 409, description: 'Election name conflict.' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR)
  async create(@Body() dto: CreateElectionDto, @Req() req: AuthenticatedRequest) {
    const election = await this.createElection.execute({
      name: dto.name,
      description: dto.description,
      startDate: dto.startDate,
      startTime: dto.startTime,
      endDate: dto.endDate,
      endTime: dto.endTime,
      blankVoteEnabled: dto.blankVoteEnabled,
      requestingUserId: req.user?.sub,
    });
    return ElectionPresenter.toResponse(election);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update an existing election',
    description: 'Updates an election in CREATED state. Requires ADMINISTRATOR role.',
  })
  @ApiParam({ name: 'id', description: 'Unique identifier of the election.', example: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Election updated successfully.',
    type: ElectionResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request data.' })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR role.' })
  @ApiResponse({ status: 404, description: 'Election not found.' })
  @ApiResponse({ status: 409, description: 'Election not editable or name conflict.' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateElectionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const election = await this.updateElection.execute(id, dto, req.user?.sub);
    return ElectionPresenter.toResponse(election);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete election',
    description:
      'Deletes a pending election only when it has no associated candidates or votes. ' +
      'This operation is restricted to administrators.',
  })
  @ApiParam({ name: 'id', description: 'Unique identifier of the election.', example: 'uuid' })
  @ApiResponse({ status: 204, description: 'Election successfully deleted.' })
  @ApiResponse({ status: 400, description: 'Invalid election ID.' })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR role.' })
  @ApiResponse({ status: 404, description: 'Election not found.' })
  @ApiResponse({
    status: 409,
    description:
      'Election cannot be deleted because it is not in a deletable state or has associated candidates or votes.',
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR)
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    await this.deleteElection.execute(id, req.user?.sub);
  }
}
