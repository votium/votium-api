import { Body, Controller, Post } from '@nestjs/common';
import { LoginDto } from '../../application/dtos/login.dto';
import { LoginUseCase } from '../../application/use-cases/login.use-case';
import { AuthPresenter } from '../presenters/auth.presenter';

@Controller('auth')
export class AuthController {
  constructor(private readonly login: LoginUseCase) {}

  @Post('login')
  async loginUser(@Body() dto: LoginDto) {
    const result = await this.login.execute(dto);
    return AuthPresenter.toResponse(result);
  }
}
