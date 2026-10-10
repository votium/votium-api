import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from 'src/modules/auth/presentation/guards/jwt-auth.guard';
import { Roles } from 'src/modules/auth/presentation/guards/roles.decorator';
import { RolesGuard } from 'src/modules/auth/presentation/guards/roles.guard';
import { RoleName } from 'src/modules/iam/domain/value-objects/role-name.vo';
import { AssociateCandidacyDto } from '../../application/dtos/associate-candidacy.dto';
import { DeleteCandidacyUseCase } from '../../application/use-cases/delete-candidacy.use-case';
import { GetElectionCandidaciesUseCase } from '../../application/use-cases/get-election-candidacies.use-case';
import { RegisterCandidacyUseCase } from '../../application/use-cases/register-candidacy.use-case';
import { CandidacyResponseDto } from '../dtos/candidacy-response.dto';
import { ElectionCandidaciesListResponseDto } from '../dtos/election-candidacies-list-response.dto';
import { GetElectionCandidaciesQueryDto } from '../dtos/get-election-candidacies-query.dto';
import { CandidacyPresenter } from '../presenters/candidacy.presenter';

type AuthenticatedRequest = Request & {
  user: {
    sub: string;
    email: string;
    role: RoleName;
  };
};

@ApiTags('candidacies')
@ApiCookieAuth()
@Controller('elections')
export class ElectionCandidaciesController {
  constructor(
    private readonly registerCandidacy: RegisterCandidacyUseCase,
    private readonly getElectionCandidacies: GetElectionCandidaciesUseCase,
    private readonly deleteCandidacy: DeleteCandidacyUseCase,
  ) {}

  @Post(':electionId/candidacies')
  @ApiOperation({
    summary: 'Associate an existing candidate with an election',
    description:
      'Creates the candidacy relationship between an existing global candidate and the ' +
      'specified election. The election is identified by the path parameter; only the ' +
      'candidate identifier is accepted in the body. Only allowed while the election is ' +
      'PENDING. Requires ADMINISTRATOR role.',
  })
  @ApiParam({ name: 'electionId', description: 'UUID of the target election.', example: 'uuid' })
  @ApiBody({ type: AssociateCandidacyDto })
  @ApiResponse({
    status: 201,
    description: 'Candidacy registered successfully.',
    type: CandidacyResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request data.' })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR role.' })
  @ApiResponse({ status: 404, description: 'Election or candidate not found.' })
  @ApiResponse({
    status: 409,
    description: 'Duplicate candidacy or election is not pending.',
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR)
  async create(
    @Param('electionId', ParseUUIDPipe) electionId: string,
    @Body() dto: AssociateCandidacyDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const candidacy = await this.registerCandidacy.execute({
      electionId,
      candidateId: dto.candidateId,
      requestingUserId: req.user?.sub,
    });
    return CandidacyPresenter.toResponse(candidacy);
  }

  @Get(':electionId/candidacies')
  @ApiOperation({
    summary: 'Query candidacies for an election',
    description:
      'Returns a paginated list of the candidacies registered for a specific election. ' +
      'Supports optional filtering by candidate name (partial and case-insensitive). ' +
      'INACTIVE candidates are never returned. Requires ADMINISTRATOR or AUDITOR role.',
  })
  @ApiParam({ name: 'electionId', description: 'UUID of the target election.', example: 'uuid' })
  @ApiQuery({ name: 'page', required: false, example: 1, description: '1-based page number.' })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: 10,
    description: 'Page size (number of candidacies per page).',
  })
  @ApiQuery({
    name: 'candidateName',
    required: false,
    description:
      'Filters candidacies by the candidate first or last name (partial, case-insensitive).',
  })
  @ApiResponse({
    status: 200,
    description: 'Candidacies retrieved successfully.',
    type: ElectionCandidaciesListResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid election identifier or query parameters.' })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR or AUDITOR role.' })
  @ApiResponse({ status: 404, description: 'Election not found.' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR, RoleName.AUDITOR)
  async getCandidacies(
    @Param('electionId', ParseUUIDPipe) electionId: string,
    @Query() query: GetElectionCandidaciesQueryDto,
  ) {
    const result = await this.getElectionCandidacies.execute({
      electionId,
      page: query.page,
      limit: query.limit,
      candidateName: query.candidateName,
    });
    return CandidacyPresenter.toElectionCandidaciesList(result, query.page, query.limit);
  }

  @Delete(':electionId/candidacies/:candidacyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a candidacy from an election',
    description:
      'Removes the candidacy associated with the election. Only allowed while the ' +
      'election is PENDING. Never renumbers remaining candidacies. Requires ' +
      'ADMINISTRATOR role.',
  })
  @ApiParam({ name: 'electionId', description: 'UUID of the target election.', example: 'uuid' })
  @ApiParam({
    name: 'candidacyId',
    description: 'UUID of the candidacy to delete.',
    example: 'uuid',
  })
  @ApiResponse({ status: 204, description: 'Candidacy deleted successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid election or candidacy identifier.' })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR role.' })
  @ApiResponse({
    status: 404,
    description: 'Election, candidacy, or election-candidacy scope not found.',
  })
  @ApiResponse({
    status: 409,
    description: 'Election is not pending; candidacy cannot be removed.',
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR)
  async remove(
    @Param('electionId', ParseUUIDPipe) electionId: string,
    @Param('candidacyId', ParseUUIDPipe) candidacyId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.deleteCandidacy.execute({
      electionId,
      candidacyId,
      requestingUserId: req.user?.sub,
    });
  }
}
