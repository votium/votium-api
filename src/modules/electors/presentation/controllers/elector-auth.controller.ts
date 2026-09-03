import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { LoginElectorUseCase } from '../../application/use-cases/login-elector.use-case';
import { VerifyElectorMfaUseCase } from '../../application/use-cases/verify-elector-mfa.use-case';
import { ResendElectorMfaUseCase } from '../../application/use-cases/resend-elector-mfa.use-case';
import { ElectorLoginDto } from '../dtos/elector-login.dto';
import { ElectorMfaRequiredResponseDto } from '../dtos/elector-mfa-required-response.dto';
import { ElectorAuthResponseDto } from '../dtos/elector-auth-response.dto';
import { ElectorMfaResendResponseDto } from '../dtos/elector-mfa-resend-response.dto';
import { VerifyElectorMfaDto } from '../dtos/verify-elector-mfa.dto';
import { ResendElectorMfaDto } from '../dtos/resend-elector-mfa.dto';

@ApiTags('electors')
@Controller('electors/auth')
export class ElectorAuthController {
  constructor(
    private readonly loginElector: LoginElectorUseCase,
    private readonly verifyElectorMfa: VerifyElectorMfaUseCase,
    private readonly resendElectorMfa: ResendElectorMfaUseCase,
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
}
