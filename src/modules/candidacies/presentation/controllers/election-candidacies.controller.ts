import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/presentation/guards/jwt-auth.guard';
import { Roles } from 'src/modules/auth/presentation/guards/roles.decorator';
import { RolesGuard } from 'src/modules/auth/presentation/guards/roles.guard';
import { RoleName } from 'src/modules/iam/domain/value-objects/role-name.vo';
import { GetElectionCandidaciesUseCase } from '../../application/use-cases/get-election-candidacies.use-case';
import { ElectionCandidaciesResponseDto } from '../dtos/election-candidacies-response.dto';
import { GetElectionCandidaciesQueryDto } from '../dtos/get-election-candidacies-query.dto';
import { CandidacyPresenter } from '../presenters/candidacy.presenter';

@ApiTags('candidacies')
@ApiBearerAuth()
@Controller('elections')
export class ElectionCandidaciesController {
  constructor(private readonly getElectionCandidacies: GetElectionCandidaciesUseCase) {}

  @Get(':electionId/candidacies')
  @ApiOperation({
    summary: 'Query candidacies for an election',
    description:
      'Returns the candidacies registered for a specific election together with the election ' +
      'name. Supports optional filtering by candidate name and election name (both partial and ' +
      'case-insensitive). INACTIVE candidates are never returned. Requires ADMINISTRATOR or AUDITOR role.',
  })
  @ApiParam({ name: 'electionId', description: 'UUID of the target election.', example: 'uuid' })
  @ApiQuery({
    name: 'candidateName',
    required: false,
    description:
      'Filters candidacies by the candidate first or last name (partial, case-insensitive).',
  })
  @ApiQuery({
    name: 'electionName',
    required: false,
    description:
      'Filters candidacies by the election name (partial, case-insensitive). Returns an empty list when it does not match.',
  })
  @ApiResponse({
    status: 200,
    description: 'Candidacies retrieved successfully.',
    type: ElectionCandidaciesResponseDto,
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
      candidateName: query.candidateName,
      electionName: query.electionName,
    });
    return CandidacyPresenter.toElectionCandidacies(result);
  }
}
