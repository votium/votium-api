import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetFinalElectionResultsUseCase } from '../../application/use-cases/get-final-election-results.use-case';
import { FinalElectionResultsResponseDto } from '../dtos/final-election-results-response.dto';
import { FinalElectionResultsPresenter } from '../presenters/final-election-results.presenter';

// Public endpoint: no guards and no cookie. It only returns aggregated counts.
@ApiTags('results')
@Controller('elections')
export class ElectionResultsController {
  constructor(private readonly getFinalResults: GetFinalElectionResultsUseCase) {}

  @Get(':electionId/results')
  @ApiOperation({
    summary: 'Get published final election results',
    description:
      'Public, read-only results: total votes, votes per candidacy and blank votes. ' +
      'Available only once the election is PUBLISHED by an administrator. ' +
      'Individual votes are never exposed.',
  })
  @ApiParam({
    name: 'electionId',
    description: 'UUID of the election.',
    example: '3f1c2a9e-7b4d-4c1a-9f2e-1a2b3c4d5e6f',
  })
  @ApiResponse({ status: 200, type: FinalElectionResultsResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid election identifier.' })
  @ApiResponse({ status: 404, description: 'Election not found (ELECTION_NOT_FOUND).' })
  @ApiResponse({
    status: 409,
    description: 'Results are not published for this election (RESULTS_NOT_PUBLISHED).',
  })
  async getResults(
    @Param('electionId', ParseUUIDPipe) electionId: string,
  ): Promise<FinalElectionResultsResponseDto> {
    const result = await this.getFinalResults.execute(electionId);
    return FinalElectionResultsPresenter.toResponse(result);
  }
}
