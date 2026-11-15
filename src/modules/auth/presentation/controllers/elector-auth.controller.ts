import { ApiBody, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
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
import { ForgotPasswordDto } from '../../application/dtos/forgot-password.dto';
import { ForgotPasswordResponseDto } from '../../application/dtos/forgot-password-response.dto';
import { ResetPasswordDto } from '../../application/dtos/reset-password.dto';
import { ResetPasswordResponseDto } from '../../application/dtos/reset-password-response.dto';
import { RequestElectorPasswordRecoveryUseCase } from '../../application/use-cases/request-elector-password-recovery.use-case';
import { ResetElectorPasswordUseCase } from '../../application/use-cases/reset-elector-password.use-case';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { ElectorGuard } from '../guards/elector.guard';
import { AuthPresenter } from '../presenters/auth.presenter';
import { AuthCookieService } from '../services/auth-cookie.service';

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
    private readonly cookies: AuthCookieService,
    private readonly requestPasswordRecovery: RequestElectorPasswordRecoveryUseCase,
    private readonly resetPasswordUseCase: ResetElectorPasswordUseCase,
  ) {}

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request a password recovery code (voters)',
    description:
      'Public. Sends a 6-digit recovery code (valid 15 minutes, single use) to the email if ' +
      'an active account exists. Always returns the same generic message to avoid revealing ' +
      'whether the account exists. A new code is not sent within 60 seconds of the previous one.',
  })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({ status: 200, type: ForgotPasswordResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid request data.' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    const result = await this.requestPasswordRecovery.execute({ email: dto.email });
    return new ForgotPasswordResponseDto(result.message);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset the password with a recovery code (voters)',
    description:
      'Public. Validates the recovery code and sets the new password atomically. The code ' +
      'can only be used once and expires after 15 minutes.',
  })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({ status: 200, type: ResetPasswordResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Invalid recovery code (RECOVERY_CODE_INVALID) or request data.',
  })
  @ApiResponse({
    status: 409,
    description: 'Recovery code already used (RECOVERY_CODE_ALREADY_USED).',
  })
  @ApiResponse({ status: 410, description: 'Recovery code expired (RECOVERY_CODE_EXPIRED).' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    const result = await this.resetPasswordUseCase.execute({
      email: dto.email,
      code: dto.code,
      newPassword: dto.newPassword,
    });
    return new ResetPasswordResponseDto(result.message);
  }

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
    description: 'Authentication completed. The JWT is set as an HttpOnly cookie.',
    type: ElectorAuthResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request data or verification code.' })
  @ApiResponse({ status: 401, description: 'Invalid or expired session.' })
  async verifyMfa(@Body() dto: VerifyElectorMfaDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.verifyElectorMfa.execute(dto);
    this.cookies.setAccessToken(res, result.accessToken, result.expiresIn);
    return new ElectorAuthResponseDto({ expiresIn: result.expiresIn });
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
  @ApiCookieAuth()
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
