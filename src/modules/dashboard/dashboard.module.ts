import { Module } from '@nestjs/common';
import { AuthModule } from 'src/modules/auth/auth.module';
import { IamModule } from 'src/modules/iam/iam.module';
import { GetElectionStatusCountsUseCase } from './application/use-cases/get-election-status-counts.use-case';
import { GetRecentActivityUseCase } from './application/use-cases/get-recent-activity.use-case';
import { GetSystemSummaryUseCase } from './application/use-cases/get-system-summary.use-case';
import { GetUpcomingElectionsUseCase } from './application/use-cases/get-upcoming-elections.use-case';
import {
  DASHBOARD_REPOSITORY,
  type DashboardRepository,
} from './domain/repositories/dashboard.repository.interface';
import { PrismaDashboardRepository } from './infrastructure/repositories/prisma-dashboard.repository';
import { DashboardController } from './presentation/controllers/dashboard.controller';

@Module({
  imports: [IamModule, AuthModule],
  controllers: [DashboardController],
  providers: [
    { provide: DASHBOARD_REPOSITORY, useClass: PrismaDashboardRepository },
    {
      provide: GetSystemSummaryUseCase,
      useFactory: (dashboard: DashboardRepository) => new GetSystemSummaryUseCase(dashboard),
      inject: [DASHBOARD_REPOSITORY],
    },
    {
      provide: GetElectionStatusCountsUseCase,
      useFactory: (dashboard: DashboardRepository) => new GetElectionStatusCountsUseCase(dashboard),
      inject: [DASHBOARD_REPOSITORY],
    },
    {
      provide: GetUpcomingElectionsUseCase,
      useFactory: (dashboard: DashboardRepository) => new GetUpcomingElectionsUseCase(dashboard),
      inject: [DASHBOARD_REPOSITORY],
    },
    {
      provide: GetRecentActivityUseCase,
      useFactory: (dashboard: DashboardRepository) => new GetRecentActivityUseCase(dashboard),
      inject: [DASHBOARD_REPOSITORY],
    },
  ],
})
export class DashboardModule {}
