import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordResponseDto {
  @ApiProperty({ example: 'Password updated successfully.' })
  message!: string;

  constructor(message: string) {
    this.message = message;
  }
}
