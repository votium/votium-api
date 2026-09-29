import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { ElectorGuard } from 'src/modules/auth/presentation/guards/elector.guard';
import { JwtAuthGuard } from 'src/modules/auth/presentation/guards/jwt-auth.guard';
import { RegisterVoteUseCase } from '../../application/use-cases/register-vote.use-case';
import { RegisterVoteDto } from '../dtos/register-vote.dto';
import { RegisterVoteResponseDto } from '../dtos/register-vote-response.dto';
import { VotePresenter } from '../presenters/vote.presenter';

type AuthenticatedRequest = Request & {
  user: {
    sub: string;
    email: string;
    actorType: string;
  };
};

@ApiTags('voting')
@ApiCookieAuth()
@Controller('elections')
export class VotesController {
  constructor(private readonly registerVote: RegisterVoteUseCase) {}

  @Post(':electionId/votes')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register the authenticated elector vote',
    description:
      'Registers the vote of the authenticated elector for an ACTIVE election. The vote is ' +
      'recorded anonymously. Provide a candidacy UUID belonging to the election, or "blank" ' +
      'for a blank vote (accepted only when blank voting is enabled for the election).',
  })
  @ApiParam({ name: 'electionId', description: 'UUID of the target election.' })
  @ApiBody({ type: RegisterVoteDto })
  @ApiResponse({
    status: 201,
    description: 'Vote registered successfully.',
    type: RegisterVoteResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid election identifier or request body.' })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires an elector principal.' })
  @ApiResponse({
    status: 404,
    description: 'Election, electoral-roll association, or candidacy not found.',
  })
  @ApiResponse({
    status: 409,
    description: 'Election is not active, or blank voting is disabled.',
  })
  @UseGuards(JwtAuthGuard, ElectorGuard)
  async vote(
    @Param('electionId', ParseUUIDPipe) electionId: string,
    @Body() dto: RegisterVoteDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<RegisterVoteResponseDto> {
    const result = await this.registerVote.execute({
      electionId,
      electorId: req.user.sub,
      candidacyId: dto.candidacyId,
    });

    return VotePresenter.toResponse(result);
  }
}
