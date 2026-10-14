import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/presentation/guards/jwt-auth.guard';
import { Roles } from 'src/modules/auth/presentation/guards/roles.decorator';
import { RolesGuard } from 'src/modules/auth/presentation/guards/roles.guard';
import { RoleName } from 'src/modules/iam/domain/value-objects/role-name.vo';
import { GetElectionStatusCountsUseCase } from '../../application/use-cases/get-election-status-counts.use-case';
import { GetRecentActivityUseCase } from '../../application/use-cases/get-recent-activity.use-case';
import { GetSystemSummaryUseCase } from '../../application/use-cases/get-system-summary.use-case';
import { GetUpcomingElectionsUseCase } from '../../application/use-cases/get-upcoming-elections.use-case';
import { DashboardSummaryResponseDto } from '../dtos/dashboard-summary-response.dto';
import { ElectionStatusCountsResponseDto } from '../dtos/election-status-counts-response.dto';
import { RecentActivityResponseDto } from '../dtos/recent-activity-response.dto';
import { UpcomingElectionResponseDto } from '../dtos/upcoming-election-response.dto';
import { UpcomingElectionsQueryDto } from '../dtos/upcoming-elections-query.dto';
import { DashboardPresenter } from '../presenters/dashboard.presenter';

@ApiTags('dashboard')
@ApiCookieAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly getSystemSummary: GetSystemSummaryUseCase,
    private readonly getElectionStatusCounts: GetElectionStatusCountsUseCase,
    private readonly getUpcomingElections: GetUpcomingElectionsUseCase,
    private readonly getRecentActivity: GetRecentActivityUseCase,
  ) {}

  @Get('summary')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR, RoleName.AUDITOR)
  @ApiOperation({
    summary: 'Get system summary',
    description:
      'Returns the total number of elections, electors and candidates currently stored in the ' +
      'system. Inactive/disabled records are included; only logically deleted records are excluded. ' +
      'Requires ADMINISTRATOR or AUDITOR role.',
  })
  @ApiResponse({
    status: 200,
    description: 'System summary retrieved successfully.',
    type: DashboardSummaryResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR or AUDITOR role.' })
  async summary() {
    return DashboardPresenter.toSummary(await this.getSystemSummary.execute());
  }

  @Get('elections/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR, RoleName.AUDITOR)
  @ApiOperation({
    summary: 'Get elections grouped by lifecycle status',
    description:
      'Returns the number of elections for each lifecycle state. All five states are always ' +
      'present. Requires ADMINISTRATOR or AUDITOR role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Election status counts retrieved successfully.',
    type: ElectionStatusCountsResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR or AUDITOR role.' })
  async status() {
    return DashboardPresenter.toStatusCounts(await this.getElectionStatusCounts.execute());
  }

  @Get('elections/upcoming')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR, RoleName.AUDITOR)
  @ApiOperation({
    summary: 'Get upcoming elections',
    description:
      'Returns elections whose configured start date/time falls within the requested future ' +
      'window, ordered by start date/time ascending. Requires ADMINISTRATOR or AUDITOR role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Upcoming elections retrieved successfully.',
    type: UpcomingElectionResponseDto,
    isArray: true,
  })
  @ApiResponse({ status: 400, description: 'Invalid `days` query parameter.' })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR or AUDITOR role.' })
  async upcoming(@Query() query: UpcomingElectionsQueryDto) {
    const results = await this.getUpcomingElections.execute({ days: query.days });
    return DashboardPresenter.toUpcomingElections(results);
  }

  @Get('activity/recent')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR, RoleName.AUDITOR)
  @ApiOperation({
    summary: 'Get recent activity',
    description:
      'Returns the five most recent system activity records, newest first. Requires ADMINISTRATOR ' +
      'or AUDITOR role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Recent activity retrieved successfully.',
    type: RecentActivityResponseDto,
    isArray: true,
  })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR or AUDITOR role.' })
  async recent() {
    return DashboardPresenter.toRecentActivity(await this.getRecentActivity.execute());
  }
}
