import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Body, Controller, Post } from '@nestjs/common';
import { LoginDto } from '../../application/dtos/login.dto';
import { MfaRequiredResponseDto } from '../../application/dtos/mfa-required-response.dto';
import { AuthTokensResponseDto } from '../../application/dtos/auth-tokens-response.dto';
import { VerifyMfaDto } from '../../application/dtos/verify-mfa.dto';
import { ResendMfaDto } from '../../application/dtos/resend-mfa.dto';
import { ResendMfaResponseDto } from '../../application/dtos/resend-mfa-response.dto';
import { LoginUseCase } from '../../application/use-cases/login.use-case';
import { VerifyMfaUseCase } from '../../application/use-cases/verify-mfa.use-case';
import { ResendMfaUseCase } from '../../application/use-cases/resend-mfa.use-case';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly login: LoginUseCase,
    private readonly verifyMfa: VerifyMfaUseCase,
    private readonly resendMfa: ResendMfaUseCase,
  ) {}

  @Post('login')
  @ApiOperation({ summary: 'Validate credentials and start the MFA authentication process' })
  async loginUser(@Body() dto: LoginDto) {
    const result = await this.login.execute(dto);
    return new MfaRequiredResponseDto(result);
  }

  @Post('mfa/verify')
  @ApiOperation({ summary: 'Verify the six-digit OTP and complete authentication' })
  async verifyMfaCode(@Body() dto: VerifyMfaDto) {
    const result = await this.verifyMfa.execute(dto);
    return new AuthTokensResponseDto(result);
  }

  @Post('mfa/resend')
  @ApiOperation({ summary: 'Generate and send a new verification code' })
  async resendMfaCode(@Body() dto: ResendMfaDto) {
    const result = await this.resendMfa.execute(dto);
    return new ResendMfaResponseDto(result);
  }
}
