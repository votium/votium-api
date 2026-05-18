import { Body, Controller, Post } from '@nestjs/common';
import { LoginDto } from '../../application/dtos/login.dto';
import { AuthResponseDto } from '../../application/dtos/auth-response.dto';
import { LoginUseCase } from '../../application/use-cases/login.use-case';

@Controller('auth')
export class AuthController {
  constructor(private readonly login: LoginUseCase) {}

  @Post('login')
  async loginUser(@Body() dto: LoginDto) {
    const result = await this.login.execute(dto);
    return new AuthResponseDto(result);
  }
}
