import { ApiProperty } from '@nestjs/swagger';

export class ElectorMfaResendResponseDto {
  @ApiProperty({ example: 'A new verification code has been sent.' })
  message!: string;

  constructor(partial: Partial<ElectorMfaResendResponseDto>) {
    Object.assign(this, partial);
  }
}
