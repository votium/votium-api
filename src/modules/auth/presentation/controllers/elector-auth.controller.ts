import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { LoginElectorUseCase } from '../../application/use-cases/login-elector.use-case';
import { VerifyElectorMfaUseCase } from '../../application/use-cases/verify-elector-mfa.use-case';
import { ResendElectorMfaUseCase } from '../../application/use-cases/resend-elector-mfa.use-case';
import { GetMeElectorUseCase } from '../../application/use-cases/get-me-elector.use-case';
import { ElectorLoginDto } from '../../application/dtos/elector-login.dto';
import { ElectorMfaRequiredResponseDto } from '../../application/dtos/elector-mfa-required-response.dto';
import { ElectorAuthResponseDto } from '../../application/dtos/elector-auth-response.dto';
import { ElectorMfaResendResponseDto } from '../../application/dtos/elector-mfa-resend-response.dto';
import { VerifyElectorMfaDto } from '../../application/dtos/verify-elector-mfa.dto';
import { ResendElectorMfaDto } from '../../application/dtos/resend-elector-mfa.dto';
import { MeElectorResponseDto } from '../../application/dtos/me-elector-response.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { ElectorGuard } from '../guards/elector.guard';
import { AuthPresenter } from '../presenters/auth.presenter';

type ElectorAuthenticatedRequest = Request & {
  user: {
    sub: string;
    email: string;
    actorType: string;
  };
};

@ApiTags('auth')
@Controller('auth/electors')
export class ElectorAuthController {
  constructor(
    private readonly loginElector: LoginElectorUseCase,
    private readonly verifyElectorMfa: VerifyElectorMfaUseCase,
    private readonly resendElectorMfa: ResendElectorMfaUseCase,
    private readonly getMeElector: GetMeElectorUseCase,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validate credentials and start the elector MFA authentication process',
  })
  @ApiResponse({
    status: 200,
    description: 'Credentials accepted. MFA challenge initiated. A verification code was sent.',
    type: ElectorMfaRequiredResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request data.' })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  async login(@Body() dto: ElectorLoginDto) {
    const result = await this.loginElector.execute(dto);
    return new ElectorMfaRequiredResponseDto(result);
  }

  @Post('mfa/verify')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Verify the six-digit OTP and complete elector authentication' })
  @ApiResponse({
    status: 201,
    description: 'Authentication completed. JWT access token issued.',
    type: ElectorAuthResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request data or verification code.' })
  @ApiResponse({ status: 401, description: 'Invalid or expired session.' })
  async verifyMfa(@Body() dto: VerifyElectorMfaDto) {
    const result = await this.verifyElectorMfa.execute(dto);
    return new ElectorAuthResponseDto(result);
  }

  @Post('mfa/resend')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generate and send a new elector verification code' })
  @ApiResponse({
    status: 201,
    description: 'A new verification code was sent.',
    type: ElectorMfaResendResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request data.' })
  @ApiResponse({ status: 401, description: 'Invalid or expired session.' })
  async resendMfa(@Body() dto: ResendElectorMfaDto) {
    const result = await this.resendElectorMfa.execute(dto);
    return new ElectorMfaResendResponseDto(result);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, ElectorGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get currently authenticated elector',
    description: 'Returns the authenticated voter/elector resolved from the JWT.',
  })
  @ApiResponse({
    status: 200,
    description: 'Authenticated elector retrieved successfully.',
    type: MeElectorResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires elector actor type.' })
  @ApiResponse({ status: 404, description: 'Elector not found.' })
  async me(@Req() req: ElectorAuthenticatedRequest) {
    const elector = await this.getMeElector.execute(req.user.sub);
    return AuthPresenter.toMeElectorResponse(elector);
  }
}
