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
  constructor(private readonly getElectorElections: GetElectorElectionsUseCase) {}

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
    });

    const data = items.map((item) => ElectorElectionPresenter.toDetail(item));
    return new PaginatedResponseDto({ data, total, page: query.page, limit: query.limit });
  }
}
