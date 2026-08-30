import { ApiProperty } from '@nestjs/swagger';

export class DeactivateElectorResponseDto {
  @ApiProperty({ example: 'Elector deactivated successfully.' })
  message!: string;

  constructor(message: string) {
    this.message = message;
  }
}
