import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordResponseDto {
  @ApiProperty({
    example: 'If an account exists for the provided email, a recovery code has been sent.',
  })
  message!: string;

  constructor(message: string) {
    this.message = message;
  }
}
