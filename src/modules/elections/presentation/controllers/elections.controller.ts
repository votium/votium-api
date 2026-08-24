import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from 'src/modules/auth/presentation/guards/jwt-auth.guard';
import { Roles } from 'src/modules/auth/presentation/guards/roles.decorator';
import { RolesGuard } from 'src/modules/auth/presentation/guards/roles.guard';
import { RoleName } from 'src/modules/iam/domain/value-objects/role-name.vo';
import { CreateElectionDto } from '../../application/dtos/create-election.dto';
import { CreateElectionUseCase } from '../../application/use-cases/create-election.use-case';
import { ElectionPresenter } from '../presenters/election.presenter';

type AuthenticatedRequest = Request & {
  user: {
    sub: string;
    email: string;
    role: RoleName;
  };
};

@ApiTags('elections')
@Controller('elections')
export class ElectionsController {
  constructor(private readonly createElection: CreateElectionUseCase) {}

  @Post()
  @ApiOperation({ summary: 'Create a new election (ADMIN only)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR)
  async create(@Body() dto: CreateElectionDto, @Req() req: AuthenticatedRequest) {
    const election = await this.createElection.execute({
      name: dto.name,
      description: dto.description,
      startDate: dto.startDate,
      startTime: dto.startTime,
      endDate: dto.endDate,
      endTime: dto.endTime,
      blankVoteEnabled: dto.blankVoteEnabled,
      requestingUserId: req.user?.sub,
    });
    return ElectionPresenter.toResponse(election);
  }
}
