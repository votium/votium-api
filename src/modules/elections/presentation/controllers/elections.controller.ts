import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from 'src/modules/auth/presentation/guards/jwt-auth.guard';
import { Roles } from 'src/modules/auth/presentation/guards/roles.decorator';
import { RolesGuard } from 'src/modules/auth/presentation/guards/roles.guard';
import { RoleName } from 'src/modules/iam/domain/value-objects/role-name.vo';
import { CreateElectionDto } from '../../application/dtos/create-election.dto';
import { UpdateElectionDto } from '../../application/dtos/update-election.dto';
import { CreateElectionUseCase } from '../../application/use-cases/create-election.use-case';
import { UpdateElectionUseCase } from '../../application/use-cases/update-election.use-case';
import { ElectionPresenter } from '../presenters/election.presenter';
import { ElectionResponseDto } from '../dtos/election-response.dto';

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
    private readonly createElection: CreateElectionUseCase,
    private readonly updateElection: UpdateElectionUseCase,
  ) {}

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
}
