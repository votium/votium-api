import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/presentation/guards/jwt-auth.guard';
import { Roles } from 'src/modules/auth/presentation/guards/roles.decorator';
import { RolesGuard } from 'src/modules/auth/presentation/guards/roles.guard';
import { RoleName } from 'src/modules/iam/domain/value-objects/role-name.vo';
import { BadRequestException } from 'src/shared/exceptions/base/bad-request.exception';
import { PaginatedResponseDto } from 'src/shared/pagination/paginated-response.dto';
import { ImportElectoralRegistryUseCase } from '../../application/use-cases/import-electoral-registry.use-case';
import { SearchElectorsUseCase } from '../../application/use-cases/search-electors.use-case';
import { ListElectorsQueryDto } from '../dtos/list-electors-query.dto';
import { ElectorPresenter } from '../presenters/elector.presenter';
import { ElectoralRegistryPresenter } from '../presenters/electoral-registry.presenter';

const MAX_CSV_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

@ApiTags('electors')
@Controller('electors')
export class ElectorsController {
  constructor(
    private readonly importRegistry: ImportElectoralRegistryUseCase,
    private readonly searchElectors: SearchElectorsUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Search registered electors' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR, RoleName.AUDITOR)
  async search(@Query() query: ListElectorsQueryDto) {
    const { electors, total } = await this.searchElectors.execute({
      page: query.page,
      limit: query.limit,
      programCode: query.program_code,
      studentCode: query.student_code,
      name: query.name,
    });

    const data = ElectorPresenter.toSearchList(electors);
    return new PaginatedResponseDto({ data, total, page: query.page, limit: query.limit });
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Import an electoral registry from a CSV file' })
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
}
