import { Body, Controller, Param, ParseUUIDPipe, Patch, Req, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiBody,
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
import { UpdateCandidacyDto } from '../../application/dtos/update-candidacy.dto';
import { UpdateCandidacyUseCase } from '../../application/use-cases/update-candidacy.use-case';
import { CandidacyResponseDto } from '../dtos/candidacy-response.dto';
import { CandidacyPresenter } from '../presenters/candidacy.presenter';

type AuthenticatedRequest = Request & {
  user: {
    sub: string;
    email: string;
    role: RoleName;
  };
};

@ApiTags('candidacies')
@ApiCookieAuth()
@Controller('candidacies')
export class CandidaciesController {
  constructor(private readonly updateCandidacy: UpdateCandidacyUseCase) {}

  @Patch(':id')
  @ApiOperation({
    summary: 'Update an existing candidacy',
    description:
      'Updates the editable fields of a candidacy (position, photo) for a ' +
      'pending election. Requires ADMINISTRATOR role.',
  })
  @ApiParam({ name: 'id', description: 'Unique identifier of the candidacy.', example: 'uuid' })
  @ApiBody({ type: UpdateCandidacyDto })
  @ApiResponse({
    status: 200,
    description: 'Candidacy updated successfully.',
    type: CandidacyResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request data.' })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR role.' })
  @ApiResponse({ status: 404, description: 'Candidacy not found.' })
  @ApiResponse({
    status: 409,
    description: 'Duplicate position or election is not pending.',
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCandidacyDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const candidacy = await this.updateCandidacy.execute({
      id,
      data: { positionNumber: dto.positionNumber, imageUrl: dto.imageUrl },
      requestingUserId: req.user?.sub,
    });
    return CandidacyPresenter.toResponse(candidacy);
  }
}
