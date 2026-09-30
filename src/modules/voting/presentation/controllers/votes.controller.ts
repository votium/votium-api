import {
  BadRequestException,
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
  ApiHeader,
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
      'for a blank vote (accepted only when blank voting is enabled for the election). ' +
      'Safe to retry: reuse the same Idempotency-Key header on retries to receive the ' +
      'already-registered result instead of a duplicate-vote error.',
  })
  @ApiParam({ name: 'electionId', description: 'UUID of the target election.' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      'Optional client-generated key identifying a single logical vote operation. ' +
      'Reuse the same value when retrying a vote whose response was lost.',
  })
  @ApiBody({ type: RegisterVoteDto })
  @ApiResponse({
    status: 201,
    description: 'Vote registered successfully.',
    type: RegisterVoteResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid election identifier, request body, or idempotency key.',
  })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires an elector principal.' })
  @ApiResponse({
    status: 404,
    description: 'Election, electoral-roll association, or candidacy not found.',
  })
  @ApiResponse({
    status: 409,
    description:
      'Election is not active, blank voting is disabled, the vote is already registered, ' +
      'or the idempotency key was reused for a different vote.',
  })
  @UseGuards(JwtAuthGuard, ElectorGuard)
  async vote(
    @Param('electionId', ParseUUIDPipe) electionId: string,
    @Body() dto: RegisterVoteDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<RegisterVoteResponseDto> {
    const idempotencyKey = extractIdempotencyKey(req);

    const result = await this.registerVote.execute({
      electionId,
      electorId: req.user.sub,
      candidacyId: dto.candidacyId,
      idempotencyKey,
    });

    return VotePresenter.toResponse(result);
  }
}

function extractIdempotencyKey(req: Request): string | undefined {
  const raw = req.headers['idempotency-key'];
  const key = Array.isArray(raw) ? raw[0] : raw;

  if (key === undefined) {
    return undefined;
  }

  if (typeof key !== 'string' || key.trim() === '') {
    throw new BadRequestException('Invalid Idempotency-Key header.');
  }

  return key;
}
