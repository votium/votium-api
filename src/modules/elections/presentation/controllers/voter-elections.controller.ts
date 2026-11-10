import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ElectorGuard } from 'src/modules/auth/presentation/guards/elector.guard';
import { JwtAuthGuard } from 'src/modules/auth/presentation/guards/jwt-auth.guard';
import { PaginatedResponseDto } from 'src/shared/pagination/paginated-response.dto';
import { ELECTION_STATUSES } from '../../domain/entities/election.entity';
import { GetVoterElectionsUseCase } from '../../application/use-cases/get-voter-elections.use-case';
import { ListVoterElectionsQueryDto } from '../dtos/list-voter-elections-query.dto';
import { VoterElectionsListResponseDto } from '../dtos/voter-elections-list-response.dto';
import { ElectionPresenter } from '../presenters/election.presenter';

type AuthenticatedRequest = Request & {
  user: {
    sub: string;
    email: string;
    actorType: string;
  };
};

@ApiTags('elections')
@ApiCookieAuth()
@Controller('elections')
export class VoterElectionsController {
  constructor(private readonly getVoterElections: GetVoterElectionsUseCase) {}

  @Get('mine')
  @UseGuards(JwtAuthGuard, ElectorGuard)
  @ApiOperation({
    summary: 'List the authenticated elector elections',
    description:
      'Returns a paginated list of elections where the authenticated elector is eligible ' +
      '(present in the electoral roll), including the elector participation state. Identity ' +
      'comes exclusively from the JWT. Read-only; vote content is never exposed.',
  })
  @ApiQuery({ name: 'electionCode', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ELECTION_STATUSES })
  @ApiQuery({ name: 'startDateFrom', required: false, example: '2026-08-29' })
  @ApiQuery({ name: 'startDateTo', required: false, example: '2026-12-31' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiResponse({
    status: 200,
    description: 'Voter elections retrieved successfully.',
    type: VoterElectionsListResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid query parameters or date range.' })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires an elector principal.' })
  @ApiResponse({ status: 404, description: 'The authenticated identity is not an elector.' })
  async list(@Query() query: ListVoterElectionsQueryDto, @Req() req: AuthenticatedRequest) {
    const { items, total } = await this.getVoterElections.execute({
      electorId: req.user.sub,
      page: query.page,
      limit: query.limit,
      electionCode: query.electionCode,
      status: query.status,
      startDateFrom: query.startDateFrom,
      startDateTo: query.startDateTo,
    });

    const data = items.map((item) => ElectionPresenter.toVoterDetail(item));
    return new PaginatedResponseDto({ data, total, page: query.page, limit: query.limit });
  }
}
