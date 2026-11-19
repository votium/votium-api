import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { ElectorGuard } from 'src/modules/auth/presentation/guards/elector.guard';
import { JwtAuthGuard } from 'src/modules/auth/presentation/guards/jwt-auth.guard';
import { ELECTION_STATUSES } from 'src/modules/elections/domain/entities/election.entity';
import { PaginatedResponseDto } from 'src/shared/pagination/paginated-response.dto';
import { GetElectorElectionsUseCase } from '../../application/use-cases/get-elector-elections.use-case';
import { ListVoterCertificatesUseCase } from '../../application/use-cases/list-voter-certificates.use-case';
import { ListVoterCertificatesQueryDto } from '../dtos/list-voter-certificates-query.dto';
import { VoterCertificatesListResponseDto } from '../dtos/voter-certificates-list-response.dto';
import { GetVotingCertificateUseCase } from '../../application/use-cases/get-voting-certificate.use-case';
import { VotingCertificateResponseDto } from '../dtos/voting-certificate-response.dto';
import { GetVoterActiveParticipationUseCase } from '../../application/use-cases/get-voter-active-participation.use-case';
import { VoterParticipationResponseDto } from '../dtos/voter-participation-response.dto';
import { GetVoterUpcomingElectionsUseCase } from '../../application/use-cases/get-voter-upcoming-elections.use-case';
import { VoterUpcomingElectionResponseDto } from '../dtos/voter-upcoming-election-response.dto';
import { ElectorElectionsListResponseDto } from '../dtos/elector-elections-list-response.dto';
import { ListElectorElectionsQueryDto } from '../dtos/list-elector-elections-query.dto';
import { ElectorElectionPresenter } from '../presenters/elector-election.presenter';

type AuthenticatedRequest = Request & {
  user: {
    sub: string;
    email: string;
    actorType: string;
  };
};

@ApiTags('electors')
@ApiCookieAuth()
@Controller('electors')
export class ElectorElectionsController {
  constructor(
    private readonly getElectorElections: GetElectorElectionsUseCase,
    private readonly getVoterUpcomingElections: GetVoterUpcomingElectionsUseCase,
    private readonly getVoterActiveParticipation: GetVoterActiveParticipationUseCase,
    private readonly getVotingCertificate: GetVotingCertificateUseCase,
    private readonly listVoterCertificates: ListVoterCertificatesUseCase,
  ) {}

  @Get('me/participation')
  @UseGuards(JwtAuthGuard, ElectorGuard)
  @ApiOperation({
    summary: "Get the authenticated voter's participation in active elections",
    description:
      'Returns how many ACTIVE elections the voter is registered for in the electoral roll, ' +
      'how many of those the voter has already voted in, and the resulting percentage ' +
      '(2 decimals; 0 when there are no active elections). Identity comes exclusively from ' +
      'the JWT. Read-only; ballot content is never exposed.',
  })
  @ApiResponse({
    status: 200,
    description: 'Participation summary retrieved successfully.',
    type: VoterParticipationResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires an elector principal.' })
  @ApiResponse({ status: 404, description: 'The authenticated identity is not an elector.' })
  async participation(@Req() req: AuthenticatedRequest) {
    const result = await this.getVoterActiveParticipation.execute({ electorId: req.user.sub });
    return ElectorElectionPresenter.toParticipation(result);
  }

  // 3-segment route: must not be declared as 2 segments, or ':id/elections' would
  // capture it and ParseUUIDPipe would reject 'me' with 400.
  @Get('me/elections/upcoming')
  @UseGuards(JwtAuthGuard, ElectorGuard)
  @ApiOperation({
    summary: "List the authenticated voter's upcoming and active elections",
    description:
      'Returns the ACTIVE elections currently in course where the authenticated voter is ' +
      'registered in the electoral roll. Includes elections already voted. Identity comes ' +
      'exclusively from the JWT. ' +
      'Read-only; ballot content is never exposed. Not paginated.',
  })
  @ApiResponse({
    status: 200,
    description: 'Upcoming and active elections retrieved successfully.',
    type: VoterUpcomingElectionResponseDto,
    isArray: true,
  })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires an elector principal.' })
  @ApiResponse({ status: 404, description: 'The authenticated identity is not an elector.' })
  async upcoming(@Req() req: AuthenticatedRequest) {
    const items = await this.getVoterUpcomingElections.execute({ electorId: req.user.sub });
    return ElectorElectionPresenter.toUpcomingList(items);
  }

  // 2 segments, but the second is not 'elections', so ':id/elections' does not capture it.
  @Get('me/certificates')
  @UseGuards(JwtAuthGuard, ElectorGuard)
  @ApiOperation({
    summary: "List the authenticated voter's issued certificates",
    description:
      'Returns a paginated list of the certificates already issued to the authenticated ' +
      'voter, newest first. Identity comes exclusively from the JWT. Read-only: it does not ' +
      'query Hyperledger Fabric, does not issue certificates and never exposes candidacy or ' +
      'ballot content. Missing certificates are generated through the single-election ' +
      'certificate endpoint.',
  })
  @ApiQuery({ name: 'page', required: false, example: 1, type: Number })
  @ApiQuery({ name: 'limit', required: false, example: 10, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Issued certificates retrieved successfully.',
    type: VoterCertificatesListResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid pagination parameters.' })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires an elector principal.' })
  @ApiResponse({
    status: 404,
    description: 'The authenticated identity is not an existing elector (ELECTOR_NOT_FOUND).',
  })
  async certificates(
    @Query() query: ListVoterCertificatesQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const { items, total } = await this.listVoterCertificates.execute({
      electorId: req.user.sub,
      page: query.page,
      limit: query.limit,
    });

    const data = items.map((item) => ElectorElectionPresenter.toVoterCertificateListItem(item));
    return new PaginatedResponseDto({ data, total, page: query.page, limit: query.limit });
  }

  // 4-segment route: does not collide with ':id/elections'.
  @Get('me/elections/:electionId/certificate')
  @UseGuards(JwtAuthGuard, ElectorGuard)
  @ApiOperation({
    summary: "Get the authenticated voter's participation certificate for an election",
    description:
      'Returns the data of the participation certificate of the authenticated voter. Issued ' +
      'only when the ledger (Hyperledger Fabric) confirms the voter as VOTED. Identity comes ' +
      'exclusively from the JWT, so a voter can only get their own certificate. The selected ' +
      'candidacy and the ballot content are never exposed. The verification code is stable ' +
      'across calls. The visual document (PDF/image) is built by the frontend.',
  })
  @ApiParam({
    name: 'electionId',
    description: 'Unique identifier of the election.',
    example: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Certificate data retrieved successfully.',
    type: VotingCertificateResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid election identifier.' })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires an elector principal.' })
  @ApiResponse({
    status: 404,
    description: 'Elector, election, or electoral-roll association not found.',
  })
  @ApiResponse({
    status: 409,
    description: 'The voter has no confirmed vote in the ledger (CERTIFICATE_NOT_AVAILABLE).',
  })
  @ApiResponse({ status: 503, description: 'Fabric is unavailable.' })
  async certificate(
    @Param('electionId', ParseUUIDPipe) electionId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const result = await this.getVotingCertificate.execute({
      electorId: req.user.sub,
      electionId,
    });
    return ElectorElectionPresenter.toVotingCertificate(result);
  }

  @Get(':id/elections')
  @UseGuards(JwtAuthGuard, ElectorGuard)
  @ApiOperation({
    summary: "List the authenticated elector's elections",
    description:
      'Returns a paginated list of elections where the authenticated elector is eligible ' +
      '(present in the electoral roll), including the elector participation state. The ' +
      'identity comes from the JWT; the path id must match the authenticated elector. ' +
      'Read-only; vote content is never exposed.',
  })
  @ApiParam({ name: 'id', description: 'Unique identifier of the elector.', example: 'uuid' })
  @ApiQuery({ name: 'electionCode', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ELECTION_STATUSES })
  @ApiQuery({ name: 'startDateFrom', required: false, example: '2026-08-29' })
  @ApiQuery({ name: 'startDateTo', required: false, example: '2026-12-31' })
  @ApiQuery({
    name: 'hasVoted',
    required: false,
    type: Boolean,
    description:
      'true = elections already voted by the elector; false = elections not voted yet. ' +
      'When omitted, both are returned. Only the lowercase strings true/false are accepted.',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiResponse({
    status: 200,
    description: 'Elector elections retrieved successfully.',
    type: ElectorElectionsListResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid query parameters or date range.' })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires an elector principal or own elector id.' })
  @ApiResponse({ status: 404, description: 'The authenticated identity is not an elector.' })
  async list(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListElectorElectionsQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    if (id !== req.user.sub) {
      throw new ForbiddenException('You can only access your own elections.');
    }

    const { items, total } = await this.getElectorElections.execute({
      electorId: id,
      page: query.page,
      limit: query.limit,
      electionCode: query.electionCode,
      status: query.status,
      startDateFrom: query.startDateFrom,
      startDateTo: query.startDateTo,
      hasVoted: query.hasVoted,
    });

    const data = items.map((item) => ElectorElectionPresenter.toDetail(item));
    return new PaginatedResponseDto({ data, total, page: query.page, limit: query.limit });
  }
}
