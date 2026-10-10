import { ApiProperty } from '@nestjs/swagger';

export class ResendMfaResponseDto {
  @ApiProperty({ example: 'A new verification code has been sent.' })
  message!: string;

  constructor(partial: Partial<ResendMfaResponseDto>) {
    Object.assign(this, partial);
  }
}
