import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ElectorGuard } from 'src/modules/auth/presentation/guards/elector.guard';
import { JwtAuthGuard } from 'src/modules/auth/presentation/guards/jwt-auth.guard';
import { bytesToHex } from '../../domain/crypto/pem';
import { CastAnonymousVoteUseCase } from '../../application/use-cases/cast-anonymous-vote.use-case';
import { GetAnonymousBallotReceiptUseCase } from '../../application/use-cases/get-anonymous-ballot-receipt.use-case';
import { GetAnonymousVotingResultsUseCase } from '../../application/use-cases/get-anonymous-voting-results.use-case';
import { GetBallotCredentialStatusUseCase } from '../../application/use-cases/get-ballot-credential-status.use-case';
import { GetBlindSignaturePublicKeyUseCase } from '../../application/use-cases/get-blind-signature-public-key.use-case';
import { IssueBallotCredentialUseCase } from '../../application/use-cases/issue-ballot-credential.use-case';
import { AnonymousVoteRequestDto } from '../dtos/anonymous-vote-request.dto';
import { BallotCredentialRequestDto } from '../dtos/ballot-credential-request.dto';

type ElectorRequest = Request & { user: { sub: string } };

// Routes follow specs/anonymous-voting-spec.md, section 4. Identity (cookie) is used only for
// credential issuance and status. The vote endpoint reads no cookie at all.
@ApiTags('anonymous-voting')
@Controller('elections')
export class AnonymousVotingController {
  constructor(
    private readonly publicKey: GetBlindSignaturePublicKeyUseCase,
    private readonly issue: IssueBallotCredentialUseCase,
    private readonly credentialStatus: GetBallotCredentialStatusUseCase,
    private readonly castVote: CastAnonymousVoteUseCase,
    private readonly receipt: GetAnonymousBallotReceiptUseCase,
    private readonly results: GetAnonymousVotingResultsUseCase,
  ) {}

  @Get(':electionId/anonymous-voting/public-key')
  @ApiOperation({ summary: 'RSA public key used to blind-sign ballot credentials (public).' })
  async getPublicKey(@Param('electionId', ParseUUIDPipe) electionId: string) {
    const key = await this.publicKey.execute(electionId);
    return key;
  }

  @Post(':electionId/anonymous-voting/credentials')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, ElectorGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Register y and obtain a blind signature. One credential per elector and election.',
  })
  async issueCredential(
    @Param('electionId', ParseUUIDPipe) electionId: string,
    @Body() dto: BallotCredentialRequestDto,
    @Req() req: ElectorRequest,
  ) {
    const signature = await this.issue.execute({
      electionId,
      electorId: req.user.sub,
      y: dto.y,
      blindedMessageHex: dto.blindedMessageHex,
    });
    return { blindSignatureHex: bytesToHex(signature) };
  }

  @Get(':electionId/anonymous-voting/credentials/status')
  @UseGuards(JwtAuthGuard, ElectorGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary:
      'Whether this elector already received a credential. Does not say whether the vote arrived.',
  })
  async status(@Param('electionId', ParseUUIDPipe) electionId: string, @Req() req: ElectorRequest) {
    return this.credentialStatus.execute(electionId, req.user.sub);
  }

  // Public and cookie-less by design: the vote carries no identity.
  @Post(':electionId/anonymous-votes')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Cast an anonymous vote with a blind-signed ballot and an eligibility proof.',
  })
  async vote(
    @Param('electionId', ParseUUIDPipe) electionId: string,
    @Body() dto: AnonymousVoteRequestDto,
  ) {
    return this.castVote.execute({
      electionId,
      ballotId: dto.ballotId,
      candidacyId: dto.candidacyId,
      signatureHex: dto.signatureHex,
      proof: dto.proof,
    });
  }

  @Get(':electionId/anonymous-voting/receipts/:ballotId')
  @ApiOperation({
    summary: 'Receipt: proves a ballot was registered. Never reveals the candidacy.',
  })
  async getReceipt(
    @Param('electionId', ParseUUIDPipe) electionId: string,
    @Param('ballotId', ParseUUIDPipe) ballotId: string,
  ) {
    const found = await this.receipt.execute(electionId, ballotId);
    return {
      electionId: found.electionId,
      ballotId: found.ballotId,
      registeredAt: found.registeredAt.toISOString(),
    };
  }

  @Get(':electionId/anonymous-voting/results')
  @ApiOperation({ summary: 'Results. Available only once the election is CLOSED or PUBLISHED.' })
  async getResults(@Param('electionId', ParseUUIDPipe) electionId: string) {
    return this.results.execute(electionId);
  }
}
