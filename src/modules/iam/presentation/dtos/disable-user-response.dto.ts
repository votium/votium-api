import { ApiProperty } from '@nestjs/swagger';

export class DisableUserResponseDto {
  @ApiProperty({ example: 'User disabled successfully' })
  message!: string;

  constructor(message: string) {
    this.message = message;
  }
}
