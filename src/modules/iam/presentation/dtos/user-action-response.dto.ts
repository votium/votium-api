import { ApiProperty } from '@nestjs/swagger';

export class UserActionResponseDto {
  @ApiProperty({ example: 'User activated successfully.' })
  message!: string;

  constructor(message: string) {
    this.message = message;
  }
}
