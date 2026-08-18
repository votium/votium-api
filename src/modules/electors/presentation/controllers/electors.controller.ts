import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from 'src/modules/auth/presentation/guards/jwt-auth.guard';
import { Roles } from 'src/modules/auth/presentation/guards/roles.decorator';
import { RolesGuard } from 'src/modules/auth/presentation/guards/roles.guard';
import { RoleName } from 'src/modules/iam/domain/value-objects/role-name.vo';
import { BadRequestException } from 'src/shared/exceptions/base/bad-request.exception';
import { DeactivateElectorUseCase } from '../../application/use-cases/deactivate-elector.use-case';
import { ImportElectoralRegistryUseCase } from '../../application/use-cases/import-electoral-registry.use-case';
import { ElectoralRegistryPresenter } from '../presenters/electoral-registry.presenter';
import { DeactivateElectorResponseDto } from '../dtos/deactivate-elector-response.dto';

const MAX_CSV_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

type AuthenticatedRequest = Request & {
  user: {
    sub: string;
    email: string;
    role: RoleName;
  };
};

@ApiTags('electors')
@Controller('electors')
export class ElectorsController {
  constructor(
    private readonly importRegistry: ImportElectoralRegistryUseCase,
    private readonly deactivateElector: DeactivateElectorUseCase,
  ) {}

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

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate an elector (soft delete)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR)
  async deactivate(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthenticatedRequest) {
    await this.deactivateElector.execute(id, req.user.sub);
    return new DeactivateElectorResponseDto('Elector deactivated successfully.');
  }
}
