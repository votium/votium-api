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
import { ElectorPresenter } from 'src/modules/electors/presentation/presenters/elector.presenter';
import { ElectorResponseDto } from 'src/modules/electors/presentation/dtos/elector-response.dto';
import { BadRequestException } from 'src/shared/exceptions/base/bad-request.exception';
import { BulkRegisterElectoralRollUseCase } from '../../application/use-cases/bulk-register-electoral-roll.use-case';
import { GetElectoralRollSummaryUseCase } from '../../application/use-cases/get-electoral-roll-summary.use-case';
import { ManualRegisterElectoralRollUseCase } from '../../application/use-cases/manual-register-electoral-roll.use-case';
import { RemoveElectorFromElectoralRollUseCase } from '../../application/use-cases/remove-elector-from-electoral-roll.use-case';
import { UpdateElectoralRollElectorUseCase } from '../../application/use-cases/update-electoral-roll-elector.use-case';
import { BulkRegisterElectoralRollResponseDto } from '../dtos/bulk-register-electoral-roll-response.dto';
import { ElectoralRollSummaryResponseDto } from '../dtos/electoral-roll-summary-response.dto';
import { RegisterElectoralRollDto } from '../dtos/register-electoral-roll.dto';
import { UpdateElectoralRollElectorDto } from '../dtos/update-electoral-roll-elector.dto';
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
    private readonly manualRegisterRoll: ManualRegisterElectoralRollUseCase,
    private readonly getSummary: GetElectoralRollSummaryUseCase,
    private readonly updateRollElector: UpdateElectoralRollElectorUseCase,
    private readonly removeRollElector: RemoveElectorFromElectoralRollUseCase,
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

  @Post('register/:electionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Manually register existing electors to an election electoral roll',
    description:
      'Registers one or more existing electors in the electoral roll of the target election. ' +
      'Electors are identified by their student code and program code and must already exist in ' +
      'the system; this endpoint never creates elector accounts. Requires ADMINISTRATOR role. ' +
      'Reported errors refer to the submitted entries: errors[].row is the 1-based position of the ' +
      'failing entry in the electors array, and totalRows always equals the number of submitted ' +
      'entries (duplicates included).',
  })
  @ApiParam({
    name: 'electionId',
    description: 'UUID of the target election.',
  })
  @ApiBody({ type: RegisterElectoralRollDto })
  @ApiResponse({
    status: 200,
    description: 'Electoral roll registration completed.',
    type: BulkRegisterElectoralRollResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Missing, empty, or invalid elector entries or election identifier.',
  })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR role.' })
  @ApiResponse({ status: 404, description: 'Election not found.' })
  @ApiResponse({
    status: 409,
    description: 'Election cannot accept registrations in its current state.',
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR)
  async manualRegisterElectors(
    @Param('electionId', ParseUUIDPipe) electionId: string,
    @Body() dto: RegisterElectoralRollDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const result = await this.manualRegisterRoll.execute({
      electionId,
      electors: dto.electors,
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

  @Patch(':electionId/electors/:electorId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update an elector in an election electoral roll',
    description:
      'Updates the editable fields (firstName, lastName, email, studentCode, programCode) of ' +
      'the elector associated with the given election electoral roll. The election must be in ' +
      'PENDING state. Only the provided fields are updated. Requires ADMINISTRATOR role.',
  })
  @ApiParam({ name: 'electionId', description: 'UUID of the target election.', example: 'uuid' })
  @ApiParam({ name: 'electorId', description: 'UUID of the elector.', example: 'uuid' })
  @ApiBody({ type: UpdateElectoralRollElectorDto })
  @ApiResponse({
    status: 200,
    description: 'Elector updated successfully.',
    type: ElectorResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid election or elector identifier, or invalid request body.',
  })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR role.' })
  @ApiResponse({
    status: 404,
    description: 'Election, elector, or electoral roll association not found.',
  })
  @ApiResponse({
    status: 409,
    description:
      'Election is not modifiable in its current state, or a duplicate email/student code conflict.',
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR)
  async updateElectoralRollElector(
    @Param('electionId', ParseUUIDPipe) electionId: string,
    @Param('electorId', ParseUUIDPipe) electorId: string,
    @Body() dto: UpdateElectoralRollElectorDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const updated = await this.updateRollElector.execute({
      electionId,
      electorId,
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        studentCode: dto.studentCode,
        programCode: dto.programCode,
      },
      requestingUserId: req.user.sub,
    });

    return ElectorPresenter.toResponse(updated);
  }

  @Delete(':electionId/electors/:electorId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove an elector from an election electoral roll',
    description:
      'Removes the association between the elector and the election electoral roll. The ' +
      'election must be in PENDING state. The elector account itself is never deleted. ' +
      'Requires ADMINISTRATOR role.',
  })
  @ApiParam({ name: 'electionId', description: 'UUID of the target election.', example: 'uuid' })
  @ApiParam({ name: 'electorId', description: 'UUID of the elector.', example: 'uuid' })
  @ApiResponse({ status: 204, description: 'Elector removed from the electoral roll.' })
  @ApiResponse({
    status: 400,
    description: 'Invalid election or elector identifier.',
  })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR role.' })
  @ApiResponse({
    status: 404,
    description: 'Election, elector, or electoral roll association not found.',
  })
  @ApiResponse({
    status: 409,
    description: 'Election is not modifiable in its current state.',
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR)
  async removeElectorFromElectoralRoll(
    @Param('electionId', ParseUUIDPipe) electionId: string,
    @Param('electorId', ParseUUIDPipe) electorId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.removeRollElector.execute({
      electionId,
      electorId,
      requestingUserId: req.user.sub,
    });
  }
}
