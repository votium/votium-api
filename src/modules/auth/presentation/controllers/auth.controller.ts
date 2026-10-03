import { ApiCookieAuth, ApiOperation, ApiTags, ApiResponse } from '@nestjs/swagger';
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
import { RoleName } from 'src/modules/iam/domain/value-objects/role-name.vo';
import { LoginDto } from '../../application/dtos/login.dto';
import { MfaRequiredResponseDto } from '../../application/dtos/mfa-required-response.dto';
import { AuthTokensResponseDto } from '../../application/dtos/auth-tokens-response.dto';
import { LogoutResponseDto } from '../../application/dtos/logout-response.dto';
import { VerifyMfaDto } from '../../application/dtos/verify-mfa.dto';
import { ResendMfaDto } from '../../application/dtos/resend-mfa.dto';
import { ResendMfaResponseDto } from '../../application/dtos/resend-mfa-response.dto';
import { MeUserResponseDto } from '../../application/dtos/me-user-response.dto';
import { LoginUseCase } from '../../application/use-cases/login.use-case';
import { VerifyMfaUseCase } from '../../application/use-cases/verify-mfa.use-case';
import { ResendMfaUseCase } from '../../application/use-cases/resend-mfa.use-case';
import { GetMeUserUseCase } from '../../application/use-cases/get-me-user.use-case';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../guards/roles.decorator';
import { AuthPresenter } from '../presenters/auth.presenter';
import { AuthCookieService } from '../services/auth-cookie.service';

type AuthenticatedRequest = Request & {
  user: {
    sub: string;
    email: string;
    role: RoleName;
  };
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly login: LoginUseCase,
    private readonly verifyMfa: VerifyMfaUseCase,
    private readonly resendMfa: ResendMfaUseCase,
    private readonly getMeUser: GetMeUserUseCase,
    private readonly cookies: AuthCookieService,
  ) {}

  @Post('login')
  @ApiOperation({ summary: 'Validate credentials and start the MFA authentication process' })
  @ApiResponse({
    status: 201,
    description: 'MFA challenge initiated. A verification code was sent.',
    type: MfaRequiredResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request data.' })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  async loginUser(@Body() dto: LoginDto) {
    const result = await this.login.execute(dto);
    return new MfaRequiredResponseDto(result);
  }

  @Post('mfa/verify')
  @ApiOperation({ summary: 'Verify the six-digit OTP and complete authentication' })
  @ApiResponse({
    status: 201,
    description: 'Authentication completed. The JWT is set as an HttpOnly cookie.',
    type: AuthTokensResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request data.' })
  @ApiResponse({ status: 401, description: 'Invalid or expired code.' })
  async verifyMfaCode(@Body() dto: VerifyMfaDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.verifyMfa.execute(dto);
    this.cookies.setAccessToken(res, result.accessToken, result.expiresIn);
    return new AuthTokensResponseDto({ expiresIn: result.expiresIn });
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log out by clearing the authentication cookie' })
  @ApiResponse({
    status: 200,
    description: 'The authentication cookie was cleared.',
    type: LogoutResponseDto,
  })
  logout(@Res({ passthrough: true }) res: Response) {
    this.cookies.clearAccessToken(res);
    return new LogoutResponseDto('Logged out successfully.');
  }

  @Post('mfa/resend')
  @ApiOperation({ summary: 'Generate and send a new verification code' })
  @ApiResponse({
    status: 201,
    description: 'A new verification code was sent.',
    type: ResendMfaResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request data.' })
  @ApiResponse({ status: 401, description: 'Invalid or expired session.' })
  async resendMfaCode(@Body() dto: ResendMfaDto) {
    const result = await this.resendMfa.execute(dto);
    return new ResendMfaResponseDto(result);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMINISTRATOR, RoleName.AUDITOR)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Get currently authenticated user',
    description:
      'Returns the authenticated administrator or auditor resolved from the JWT. ' +
      'Requires ADMINISTRATOR or AUDITOR role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Authenticated user retrieved successfully.',
    type: MeUserResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Authentication is required.' })
  @ApiResponse({ status: 403, description: 'Requires ADMINISTRATOR or AUDITOR role.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async me(@Req() req: AuthenticatedRequest) {
    const user = await this.getMeUser.execute(req.user.sub);
    return AuthPresenter.toMeUserResponse(user);
  }
}
