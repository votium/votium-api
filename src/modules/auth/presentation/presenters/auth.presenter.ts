import { AuthResponseDto } from '../dtos/auth-response.dto';

export class AuthPresenter {
  static toResponse(result: {
    accessToken: string;
    user: { id: string; email: string; role: string };
  }): AuthResponseDto {
    return new AuthResponseDto(result);
  }
}
