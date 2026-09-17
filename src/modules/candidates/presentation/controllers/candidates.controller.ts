import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from 'src/modules/auth/presentation/guards/jwt-auth.guard';
import { Roles } from 'src/modules/auth/presentation/guards/roles.decorator';
import { RolesGuard } from 'src/modules/auth/presentation/guards/roles.guard';
import { RoleName } from 'src/modules/iam/domain/value-objects/role-name.vo';
import { PaginatedResponseDto } from 'src/shared/pagination/paginated-response.dto';
import { CreateCandidateDto } from '../../application/dtos/create-candidate.dto';
import { UpdateCandidateDto } from '../../application/dtos/update-candidate.dto';
import { DeactivateCandidateUseCase } from '../../application/use-cases/deactivate-candidate.use-case';
import { ReactivateCandidateUseCase } from '../../application/use-cases/reactivate-candidate.use-case';
import { RegisterCandidateUseCase } from '../../application/use-cases/register-candidate.use-case';
import { SearchCandidatesUseCase } from '../../application/use-cases/search-candidates.use-case';
import { UpdateCandidateUseCase } from '../../application/use-cases/update-candidate.use-case';
import { CandidatePresenter } from '../presenters/candidate.presenter';
import { CandidateResponseDto } from '../dtos/candidate-response.dto';
import { CandidatesListResponseDto } from '../dtos/candidates-list-response.dto';
import { SearchCandidatesQueryDto } from '../dtos/search-candidates-query.dto';

type AuthenticatedRequest = Request & {
  user: {
    sub: string;
    email: string;
    role: RoleName;
  };
};

@ApiTags('candidates')
@ApiBearerAuth()
@Controller('candidates')
export class CandidatesController {
  constructor(
    private readonly registerCandidate: RegisterCandidateUseCase,
    private readonly searchCandidates: SearchCandidatesUseCase,
    private readonly deactivateCandidate: DeactivateCandidateUseCase,
    private readonly updateCandidate: UpdateCandidateUseCase,
    private readonly reactivateCandidate: ReactivateCandidateUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Query candidates by optional filters',
    description:
      'Returns a paginated list of candidates matching the provided filters. Active candidates ' +
      'are returned by default; pass includeInactive=true to also include logically deleted (INACTIVE) ' +
      'candidates. Requires ADMINISTRATOR or AUDITOR role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Candidates retrieved successfully.',
    type: CandidatesListResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid query parameters.' })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR or AUDITOR role.' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR, RoleName.AUDITOR)
  async search(@Query() query: SearchCandidatesQueryDto) {
    const { candidates, total } = await this.searchCandidates.execute({
      page: query.page,
      limit: query.limit,
      firstName: query.firstName,
      lastName: query.lastName,
      name: query.name,
      studyPlanCode: query.studyPlanCode,
      studentCode: query.studentCode,
      identificationNumber: query.identificationNumber,
      includeInactive: query.includeInactive,
    });
    return new PaginatedResponseDto({
      data: CandidatePresenter.toList(candidates),
      total,
      page: query.page,
      limit: query.limit,
    });
  }

  @Post()
  @ApiOperation({
    summary: 'Register a new candidate',
    description: 'Creates a candidate. Requires ADMINISTRATOR role.',
  })
  @ApiResponse({
    status: 201,
    description: 'Candidate registered successfully.',
    type: CandidateResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request data.' })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR role.' })
  @ApiResponse({ status: 409, description: 'Duplicate student code or identification number.' })
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
      companionFirstName: dto.companionFirstName,
      companionLastName: dto.companionLastName,
      companionStudentCode: dto.companionStudentCode,
      companionProgramCode: dto.companionProgramCode,
      companionIdentification: dto.companionIdentification,
    });
    return CandidatePresenter.toResponse(candidate);
  }

  @Patch(':id/desactive')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Deactivate a candidate (soft delete)',
    description: 'Deactivates a candidate. Requires ADMINISTRATOR role.',
  })
  @ApiParam({ name: 'id', description: 'Unique identifier of the candidate.', example: 'uuid' })
  @ApiResponse({ status: 204, description: 'Candidate deactivated successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid identifier format.' })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR role.' })
  @ApiResponse({ status: 404, description: 'Candidate not found.' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR)
  async deactivate(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    await this.deactivateCandidate.execute(id, req.user.sub);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Update an existing candidate',
    description: 'Updates a candidate. Requires ADMINISTRATOR role.',
  })
  @ApiParam({ name: 'id', description: 'Unique identifier of the candidate.', example: 'uuid' })
  @ApiBody({ type: UpdateCandidateDto })
  @ApiResponse({
    status: 200,
    description: 'Candidate updated successfully.',
    type: CandidateResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request data.' })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR role.' })
  @ApiResponse({ status: 404, description: 'Candidate not found.' })
  @ApiResponse({ status: 409, description: 'Duplicate identification number.' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCandidateDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const candidate = await this.updateCandidate.execute(
      id,
      {
        firstName: dto.firstName,
        lastName: dto.lastName,
        programCode: dto.programCode,
        identificationNumber: dto.identificationNumber,
        companionFirstName: dto.companionFirstName,
        companionLastName: dto.companionLastName,
        companionStudentCode: dto.companionStudentCode,
        companionProgramCode: dto.companionProgramCode,
        companionIdentification: dto.companionIdentification,
      },
      req.user.sub,
    );
    return CandidatePresenter.toResponse(candidate);
  }

  @Patch(':id/active')
  @ApiOperation({
    summary: 'Reactivate a logically deleted candidate',
    description: 'Reactivates a deactivated candidate. Requires ADMINISTRATOR role.',
  })
  @ApiParam({ name: 'id', description: 'Unique identifier of the candidate.', example: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Candidate reactivated successfully.',
    type: CandidateResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid identifier format.' })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR role.' })
  @ApiResponse({ status: 404, description: 'Candidate not found.' })
  @ApiResponse({ status: 409, description: 'Candidate is already ACTIVE.' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR)
  async reactivate(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    const candidate = await this.reactivateCandidate.execute(id, req.user.sub);
    return CandidatePresenter.toResponse(candidate);
  }
}
