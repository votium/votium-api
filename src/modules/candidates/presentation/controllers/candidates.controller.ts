import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from 'src/modules/auth/presentation/guards/jwt-auth.guard';
import { Roles } from 'src/modules/auth/presentation/guards/roles.decorator';
import { RolesGuard } from 'src/modules/auth/presentation/guards/roles.guard';
import { RoleName } from 'src/modules/iam/domain/value-objects/role-name.vo';
import { CreateCandidateDto } from '../../application/dtos/create-candidate.dto';
import { DeactivateCandidateUseCase } from '../../application/use-cases/deactivate-candidate.use-case';
import { RegisterCandidateUseCase } from '../../application/use-cases/register-candidate.use-case';
import { SearchCandidatesUseCase } from '../../application/use-cases/search-candidates.use-case';
import { CandidatePresenter } from '../presenters/candidate.presenter';
import { SearchCandidatesQueryDto } from '../dtos/search-candidates-query.dto';

type AuthenticatedRequest = Request & {
  user: {
    sub: string;
    email: string;
    role: RoleName;
  };
};

@ApiTags('candidates')
@Controller('candidates')
export class CandidatesController {
  constructor(
    private readonly registerCandidate: RegisterCandidateUseCase,
    private readonly searchCandidates: SearchCandidatesUseCase,
    private readonly deactivateCandidate: DeactivateCandidateUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Query candidates by optional filters' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR, RoleName.AUDITOR)
  async search(@Query() query: SearchCandidatesQueryDto) {
    const candidates = await this.searchCandidates.execute({
      firstName: query.firstName,
      lastName: query.lastName,
      studyPlanCode: query.studyPlanCode,
      studentCode: query.studentCode,
      identificationNumber: query.identificationNumber,
    });
    return { data: CandidatePresenter.toList(candidates) };
  }

  @Post()
  @ApiOperation({ summary: 'Register a new candidate' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR)
  async create(@Body() dto: CreateCandidateDto, @Req() req: AuthenticatedRequest) {
    const candidate = await this.registerCandidate.execute({
      firstName: dto.firstName,
      lastName: dto.lastName,
      studentCode: dto.studentCode,
      programCode: dto.programCode,
      identificationNumber: dto.identificationNumber,
      requestingUserId: req.user?.sub,
    });
    return CandidatePresenter.toResponse(candidate);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deactivate a candidate (soft delete)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR)
  async deactivate(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    await this.deactivateCandidate.execute(id, req.user.sub);
  }
}
