import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
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
import { DeleteCandidacyUseCase } from '../../application/use-cases/delete-candidacy.use-case';
import { GetElectionCandidaciesUseCase } from '../../application/use-cases/get-election-candidacies.use-case';
import { ElectionCandidaciesResponseDto } from '../dtos/election-candidacies-response.dto';
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
@ApiBearerAuth()
@Controller('elections')
export class ElectionCandidaciesController {
  constructor(
    private readonly getElectionCandidacies: GetElectionCandidaciesUseCase,
    private readonly deleteCandidacy: DeleteCandidacyUseCase,
  ) {}

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
