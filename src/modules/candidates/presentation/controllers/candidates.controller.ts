import {
  Body,
  Controller,
  Delete,
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
  ApiQuery,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from 'src/modules/auth/presentation/guards/jwt-auth.guard';
import { Roles } from 'src/modules/auth/presentation/guards/roles.decorator';
import { RolesGuard } from 'src/modules/auth/presentation/guards/roles.guard';
import { RoleName } from 'src/modules/iam/domain/value-objects/role-name.vo';
import { PaginatedResponseDto } from 'src/shared/pagination/paginated-response.dto';
import { CreateCandidateDto } from '../../application/dtos/create-candidate.dto';
import { UpdateCandidateDto } from '../../application/dtos/update-candidate.dto';
import { ActivateCandidateUseCase } from '../../application/use-cases/activate-candidate.use-case';
import { DeactivateCandidateUseCase } from '../../application/use-cases/deactivate-candidate.use-case';
import { DeleteCandidateUseCase } from '../../application/use-cases/delete-candidate.use-case';
import { GetCandidateUseCase } from '../../application/use-cases/get-candidate.use-case';
import { RegisterCandidateUseCase } from '../../application/use-cases/register-candidate.use-case';
import { SearchCandidatesUseCase } from '../../application/use-cases/search-candidates.use-case';
import { UpdateCandidateUseCase } from '../../application/use-cases/update-candidate.use-case';
import { CANDIDATE_STATUSES } from '../../domain/entities/candidate.entity';
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
    private readonly getCandidate: GetCandidateUseCase,
    private readonly deactivateCandidate: DeactivateCandidateUseCase,
    private readonly deleteCandidate: DeleteCandidateUseCase,
    private readonly updateCandidate: UpdateCandidateUseCase,
    private readonly activateCandidate: ActivateCandidateUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Query candidates by optional filters',
    description:
      'Returns a paginated list of candidates matching the provided filters. Candidates of every ' +
      'status are returned by default; pass status to narrow the result to a single candidate ' +
      'status. Logically deleted candidates are never returned. Requires ADMINISTRATOR or AUDITOR role.',
  })
  @ApiQuery({ name: 'page', required: false, example: 1, description: '1-based page number.' })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: 10,
    description: 'Page size (number of candidates per page).',
  })
  @ApiQuery({
    name: 'firstName',
    required: false,
    example: 'Juan',
    description: 'Partial, case-insensitive match on the first name.',
  })
  @ApiQuery({
    name: 'lastName',
    required: false,
    example: 'Garcia',
    description: 'Partial, case-insensitive match on the last name.',
  })
  @ApiQuery({
    name: 'name',
    required: false,
    example: 'Juan',
    description: 'Partial, case-insensitive match on the first or last name.',
  })
  @ApiQuery({
    name: 'programCode',
    required: false,
    example: '1234',
    description: 'Program code. Exact match of four digits.',
  })
  @ApiQuery({
    name: 'studentCode',
    required: false,
    example: 'CAND-1234',
    description: 'Student code. Exact match.',
  })
  @ApiQuery({
    name: 'identificationNumber',
    required: false,
    example: 'ID-12345678',
    description: 'Identification number. Exact match.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: CANDIDATE_STATUSES,
    example: 'ACTIVE',
    description:
      'Candidate status. Exact match. When omitted, candidates of every status are returned.',
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
      programCode: query.programCode,
      studentCode: query.studentCode,
      identificationNumber: query.identificationNumber,
      status: query.status,
    });
    return new PaginatedResponseDto({
      data: CandidatePresenter.toList(candidates),
      total,
      page: query.page,
      limit: query.limit,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get candidate by id',
    description:
      'Returns a single candidate by its unique identifier. Logically deleted candidates ' +
      'are treated as not found. Requires ADMINISTRATOR or AUDITOR role.',
  })
  @ApiParam({ name: 'id', description: 'Unique identifier of the candidate.', example: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Candidate retrieved successfully.',
    type: CandidateResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid identifier format.' })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR or AUDITOR role.' })
  @ApiResponse({ status: 404, description: 'Candidate not found.' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR, RoleName.AUDITOR)
  async byId(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.getCandidate.execute(id);
    return CandidatePresenter.toDetail(result.candidate, result.elections);
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

  @Patch(':id/deactivate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Deactivate a candidate',
    description: 'Sets the candidate status to INACTIVE. Requires ADMINISTRATOR role.',
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

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Logically delete a candidate',
    description: 'Marks a candidate as deleted. Requires ADMINISTRATOR role.',
  })
  @ApiParam({ name: 'id', description: 'Unique identifier of the candidate.', example: 'uuid' })
  @ApiResponse({ status: 204, description: 'Candidate deleted successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid identifier format.' })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR role.' })
  @ApiResponse({ status: 404, description: 'Candidate not found.' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR)
  async delete(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    await this.deleteCandidate.execute(id, req.user.sub);
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

  @Patch(':id/activate')
  @ApiOperation({
    summary: 'Activate a candidate',
    description: 'Sets the candidate status to ACTIVE. Requires ADMINISTRATOR role.',
  })
  @ApiParam({ name: 'id', description: 'Unique identifier of the candidate.', example: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Candidate activated successfully.',
    type: CandidateResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid identifier format.' })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR role.' })
  @ApiResponse({ status: 404, description: 'Candidate not found.' })
  @ApiResponse({ status: 409, description: 'Candidate is already ACTIVE.' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR)
  async activate(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    const candidate = await this.activateCandidate.execute(id, req.user.sub);
    return CandidatePresenter.toResponse(candidate);
  }
}
