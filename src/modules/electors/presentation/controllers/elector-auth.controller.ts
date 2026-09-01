import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { LoginElectorUseCase } from '../../application/use-cases/login-elector.use-case';
import { ElectorLoginDto } from '../dtos/elector-login.dto';
import { ElectorAuthResponseDto } from '../dtos/elector-auth-response.dto';

@ApiTags('electors')
@Controller('electors/auth')
export class ElectorAuthController {
  constructor(private readonly loginElector: LoginElectorUseCase) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate an elector and return a JWT access token.' })
  @ApiResponse({
    status: 200,
    description: 'Authentication successful.',
    type: ElectorAuthResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request data.' })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  async login(@Body() dto: ElectorLoginDto) {
    const result = await this.loginElector.execute(dto);
    return new ElectorAuthResponseDto(result);
  }
}
