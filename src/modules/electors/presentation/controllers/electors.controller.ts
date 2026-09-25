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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiParam,
  ApiCookieAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from 'src/modules/auth/presentation/guards/jwt-auth.guard';
import { Roles } from 'src/modules/auth/presentation/guards/roles.decorator';
import { RolesGuard } from 'src/modules/auth/presentation/guards/roles.guard';
import { RoleName } from 'src/modules/iam/domain/value-objects/role-name.vo';
import { BadRequestException } from 'src/shared/exceptions/base/bad-request.exception';
import { PaginatedResponseDto } from 'src/shared/pagination/paginated-response.dto';
import { UpdateElectorDto } from '../../application/dtos/update-elector.dto';
import { ActivateElectorUseCase } from '../../application/use-cases/activate-elector.use-case';
import { DeactivateElectorUseCase } from '../../application/use-cases/deactivate-elector.use-case';
import { DeleteElectorUseCase } from '../../application/use-cases/delete-elector.use-case';
import { GetElectorUseCase } from '../../application/use-cases/get-elector.use-case';
import { ImportElectoralRegistryUseCase } from '../../application/use-cases/import-electoral-registry.use-case';
import { SearchElectorsUseCase } from '../../application/use-cases/search-electors.use-case';
import { UpdateElectorUseCase } from '../../application/use-cases/update-elector.use-case';
import { ElectoralRegistryPresenter } from '../presenters/electoral-registry.presenter';
import { ElectorPresenter } from '../presenters/elector.presenter';
import { ElectorActionResponseDto } from '../dtos/elector-action-response.dto';
import { ElectorDetailResponseDto } from '../dtos/elector-detail-response.dto';
import { ElectorsListResponseDto } from '../dtos/electors-list-response.dto';
import { ImportElectoralRegistryResponseDto } from '../dtos/import-electoral-registry-response.dto';
import { SearchElectorsQueryDto } from '../dtos/search-electors-query.dto';
import { UpdateElectorResponseDto } from '../dtos/update-elector-response.dto';

const MAX_CSV_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

type AuthenticatedRequest = Request & {
  user: {
    sub: string;
    email: string;
    role: RoleName;
  };
};

@ApiTags('electors')
@ApiCookieAuth()
@Controller('electors')
export class ElectorsController {
  constructor(
    private readonly importRegistry: ImportElectoralRegistryUseCase,
    private readonly deactivateElector: DeactivateElectorUseCase,
    private readonly deleteElector: DeleteElectorUseCase,
    private readonly activateElector: ActivateElectorUseCase,
    private readonly searchElectors: SearchElectorsUseCase,
    private readonly getElector: GetElectorUseCase,
    private readonly updateElector: UpdateElectorUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Search electors by program code, student code, name, status, or identification',
    description:
      'Returns a paginated list of electors. `name` searches the first or last name ' +
      '(partial, case-insensitive); `studentCode`, `programCode`, and `identification` are partial ' +
      'search terms; `status` filters by elector status (ACTIVE/INACTIVE). Inactive electors are always ' +
      'included unless a `status` filter excludes them. Requires ADMINISTRATOR or AUDITOR role.',
  })
  @ApiQuery({ name: 'page', required: false, example: 1, description: '1-based page number.' })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: 10,
    description: 'Page size (number of electors per page).',
  })
  @ApiQuery({
    name: 'name',
    required: false,
    example: 'Jane',
    description: 'Partial, case-insensitive match on the first or last name.',
  })
  @ApiQuery({
    name: 'studentCode',
    required: false,
    example: '202012345',
    description: 'Partial match on the student code.',
  })
  @ApiQuery({
    name: 'programCode',
    required: false,
    example: '2710',
    description: 'Partial match on the program code.',
  })
  @ApiQuery({
    name: 'identification',
    required: false,
    example: '123456789',
    description: 'Partial match on the identification number.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    example: 'ACTIVE',
    enum: ['ACTIVE', 'INACTIVE'],
    description: 'Exact match on the elector status.',
  })
  @ApiResponse({
    status: 200,
    description: 'Electors retrieved successfully.',
    type: ElectorsListResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid query parameters.' })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR or AUDITOR role.' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR, RoleName.AUDITOR)
  async search(@Query() query: SearchElectorsQueryDto) {
    const { electors, total } = await this.searchElectors.execute({
      page: query.page,
      limit: query.limit,
      programCode: query.programCode,
      studentCode: query.studentCode,
      name: query.name,
      status: query.status,
      identification: query.identification,
    });

    const data = ElectorPresenter.toList(electors);
    return new PaginatedResponseDto({ data, total, page: query.page, limit: query.limit });
  }

  @Get('me')
  @HttpCode(HttpStatus.NOT_FOUND)
  @ApiOperation({ summary: 'Legacy endpoint removed' })
  @ApiResponse({ status: 404, description: 'Legacy endpoint removed.' })
  legacyMeRemoved(): void {
    // Legacy /electors/me endpoint removed; use /auth/electors/me instead
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get elector detail by ID',
    description:
      'Returns complete elector information, including election participation history. ' +
      'Requires ADMINISTRATOR or AUDITOR role.',
  })
  @ApiParam({ name: 'id', description: 'Unique identifier of the elector.', example: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Elector detail retrieved successfully.',
    type: ElectorDetailResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid identifier format.' })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR or AUDITOR role.' })
  @ApiResponse({ status: 404, description: 'Elector not found.' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR, RoleName.AUDITOR)
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    const { elector, participation } = await this.getElector.execute(id);
    return ElectorPresenter.toDetail(elector, participation);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Update an elector',
    description:
      'Fully replaces the elector fields with the payload. All fields are required ' +
      '(PUT is a full replacement; partial updates are not allowed). ' +
      'Requires ADMINISTRATOR role.',
  })
  @ApiParam({ name: 'id', description: 'Unique identifier of the elector.', example: 'uuid' })
  @ApiBody({ type: UpdateElectorDto })
  @ApiResponse({
    status: 200,
    description: 'Elector updated successfully.',
    type: UpdateElectorResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid payload or identifier format.' })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR role.' })
  @ApiResponse({ status: 404, description: 'Elector not found.' })
  @ApiResponse({
    status: 409,
    description: 'Duplicate elector information (email, student code, or identification).',
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateElectorDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const updated = await this.updateElector.execute(id, dto, req.user.sub);
    return new UpdateElectorResponseDto('Elector updated successfully.', {
      id: updated.id as string,
    });
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Import an electoral registry from a CSV file',
    description: 'Imports electors from a CSV file. Requires ADMINISTRATOR role.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Electoral registry CSV file',
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Electoral registry imported successfully.',
    type: ImportElectoralRegistryResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Missing CSV file.' })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR role.' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_CSV_FILE_SIZE } }))
  async importElectoralRegistry(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('CSV file is required.');
    }

    const summary = await this.importRegistry.execute({
      originalName: file.originalname,
      buffer: file.buffer,
    });

    return ElectoralRegistryPresenter.toImportResponse(summary);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Logically delete an elector',
    description: 'Marks an elector as deleted. Requires ADMINISTRATOR role.',
  })
  @ApiParam({ name: 'id', description: 'Unique identifier of the elector.', example: 'uuid' })
  @ApiResponse({ status: 204, description: 'Elector deleted successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid identifier format.' })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR role.' })
  @ApiResponse({ status: 404, description: 'Elector not found.' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR)
  async delete(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    await this.deleteElector.execute(id, req.user.sub);
  }

  @Patch(':id/deactivate')
  @ApiOperation({
    summary: 'Deactivate an elector',
    description:
      'Sets the elector status to INACTIVE. Idempotent: deactivating an already ' +
      'inactive elector returns 200 without changes. Requires ADMINISTRATOR role.',
  })
  @ApiParam({ name: 'id', description: 'Unique identifier of the elector.', example: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Elector deactivated successfully.',
    type: ElectorActionResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid identifier format.' })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR role.' })
  @ApiResponse({ status: 404, description: 'Elector not found.' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR)
  async deactivate(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    await this.deactivateElector.execute(id, req.user.sub);
    return new ElectorActionResponseDto('Elector deactivated successfully.');
  }

  @Patch(':id/activate')
  @ApiOperation({
    summary: 'Activate an elector',
    description:
      'Sets the elector status to ACTIVE. Idempotent: activating an already active ' +
      'elector returns 200 without changes. Requires ADMINISTRATOR role.',
  })
  @ApiParam({ name: 'id', description: 'Unique identifier of the elector.', example: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Elector activated successfully.',
    type: ElectorActionResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid identifier format.' })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR role.' })
  @ApiResponse({ status: 404, description: 'Elector not found.' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR)
  async activate(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    await this.activateElector.execute(id, req.user.sub);
    return new ElectorActionResponseDto('Elector activated successfully.');
  }
}
