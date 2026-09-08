import {
  Controller,
  Get,
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
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from 'src/modules/auth/presentation/guards/jwt-auth.guard';
import { Roles } from 'src/modules/auth/presentation/guards/roles.decorator';
import { RolesGuard } from 'src/modules/auth/presentation/guards/roles.guard';
import { RoleName } from 'src/modules/iam/domain/value-objects/role-name.vo';
import { BadRequestException } from 'src/shared/exceptions/base/bad-request.exception';
import { BulkRegisterElectoralRollUseCase } from '../../application/use-cases/bulk-register-electoral-roll.use-case';
import { GetElectoralRollSummaryUseCase } from '../../application/use-cases/get-electoral-roll-summary.use-case';
import { BulkRegisterElectoralRollResponseDto } from '../dtos/bulk-register-electoral-roll-response.dto';
import { ElectoralRollSummaryResponseDto } from '../dtos/electoral-roll-summary-response.dto';
import { ElectoralRollPresenter } from '../presenters/electoral-roll.presenter';

const MAX_CSV_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

type AuthenticatedRequest = Request & {
  user: {
    sub: string;
    email: string;
    role: RoleName;
  };
};

@ApiTags('electoral-rolls')
@ApiBearerAuth()
@Controller('electoral-rolls')
export class ElectoralRollsController {
  constructor(
    private readonly bulkRegisterRoll: BulkRegisterElectoralRollUseCase,
    private readonly getSummary: GetElectoralRollSummaryUseCase,
  ) {}

  @Post('bulk-register/:electionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bulk register electors to an election electoral roll',
    description: 'Upload a CSV with student code and program code pairs to register electors.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'electionId', description: 'UUID of the target election.' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Electoral roll registration completed.',
    type: BulkRegisterElectoralRollResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Missing or invalid CSV file.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR role.' })
  @ApiResponse({ status: 404, description: 'Election not found.' })
  @ApiResponse({
    status: 409,
    description: 'Election cannot accept registrations in its current state.',
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_CSV_FILE_SIZE } }))
  async bulkRegisterElectoralRoll(
    @Param('electionId', ParseUUIDPipe) electionId: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!file) {
      throw new BadRequestException('CSV file is required.');
    }

    const result = await this.bulkRegisterRoll.execute({
      electionId,
      originalName: file.originalname,
      buffer: file.buffer,
      requestingUserId: req.user.sub,
    });

    return ElectoralRollPresenter.toBulkRegisterResponse(result);
  }

  @Get(':electionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get electoral roll summary for an election',
    description:
      'Returns the election name and the total number of registered voters ' +
      'for the given election. Requires ADMINISTRATOR or AUDITOR role.',
  })
  @ApiParam({ name: 'electionId', description: 'UUID of the target election.', example: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Electoral roll summary retrieved successfully.',
    type: ElectoralRollSummaryResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid election identifier.' })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR or AUDITOR role.' })
  @ApiResponse({ status: 404, description: 'Election not found.' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR, RoleName.AUDITOR)
  async getElectoralRollSummary(@Param('electionId', ParseUUIDPipe) electionId: string) {
    const result = await this.getSummary.execute(electionId);
    return ElectoralRollPresenter.toSummary(result);
  }
}
