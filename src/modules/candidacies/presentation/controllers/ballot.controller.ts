import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BallotAccessGuard } from 'src/modules/auth/presentation/guards/ballot-access.guard';
import { JwtAuthGuard } from 'src/modules/auth/presentation/guards/jwt-auth.guard';
import { GetElectionBallotUseCase } from '../../application/use-cases/get-election-ballot.use-case';
import { BallotResponseDto } from '../dtos/ballot-response.dto';
import { BallotPresenter } from '../presenters/ballot.presenter';

@ApiTags('candidacies')
@ApiBearerAuth()
@Controller('elections')
export class BallotController {
  constructor(private readonly getElectionBallot: GetElectionBallotUseCase) {}

  @Get(':electionId/ballot')
  @ApiOperation({
    summary: 'Retrieve the ballot for an election',
    description:
      'Returns the electoral ballot for the election: the election identity, the valid ' +
      'candidates registered for the election (election-specific numbers preserved, ordered ' +
      'by position number), and the blank-vote option (always available and selectable). ' +
      'INACTIVE candidates are never returned. Read-only: no records are created or ' +
      'modified. Requires ADMINISTRATOR, AUDITOR, or VOTER (elector) access.',
  })
  @ApiParam({ name: 'electionId', description: 'UUID of the target election.', example: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Ballot retrieved successfully.',
    type: BallotResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid election identifier.' })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({
    status: 403,
    description: 'Requires ADMINISTRATOR, AUDITOR, or VOTER access.',
  })
  @ApiResponse({ status: 404, description: 'Election not found.' })
  @ApiResponse({ status: 409, description: 'Election has no valid candidates.' })
  @UseGuards(JwtAuthGuard, BallotAccessGuard)
  async getBallot(@Param('electionId', ParseUUIDPipe) electionId: string) {
    const result = await this.getElectionBallot.execute({ electionId });
    return BallotPresenter.toResponse(result);
  }
}
