import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/presentation/guards/jwt-auth.guard';
import { RolesGuard } from 'src/modules/auth/presentation/guards/roles.guard';
import { Roles } from 'src/modules/auth/presentation/guards/roles.decorator';
import { RoleName } from '../../domain/value-objects/role-name.vo';
import { PaginatedResponseDto } from 'src/shared/pagination/paginated-response.dto';
import { GetAuditLogsUseCase } from '../../application/use-cases/get-audit-logs.use-case';
import { ListAuditLogsQueryDto } from '../dtos/list-audit-logs-query.dto';
import { AuditLogsListResponseDto } from '../dtos/audit-logs-list-response.dto';
import { AuditLogPresenter } from '../presenters/audit-log.presenter';

@ApiTags('logs')
@ApiCookieAuth()
@Controller('logs')
export class AuditLogsController {
  constructor(private readonly getAuditLogs: GetAuditLogsUseCase) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR, RoleName.AUDITOR)
  @ApiOperation({
    summary: 'List system audit logs',
    description:
      'Returns a paginated list of system audit logs with optional filters (userId, startDate, endDate). ' +
      'Results are ordered by timestamp descending with a deterministic id tie-breaker. Read-only. ' +
      'Requires ADMINISTRATOR or AUDITOR role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Audit logs retrieved successfully.',
    type: AuditLogsListResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid query parameters or date range.' })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR or AUDITOR role.' })
  async list(@Query() query: ListAuditLogsQueryDto) {
    const { logs, total } = await this.getAuditLogs.execute({
      page: query.page,
      limit: query.limit,
      userId: query.userId,
      startDate: query.startDate,
      endDate: query.endDate,
    });

    const data = AuditLogPresenter.toList(logs);
    return new PaginatedResponseDto({ data, total, page: query.page, limit: query.limit });
  }
}
