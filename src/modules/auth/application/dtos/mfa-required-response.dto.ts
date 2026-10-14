import { ApiProperty } from '@nestjs/swagger';

export class MfaRequiredResponseDto {
  @ApiProperty({ example: true })
  mfaRequired!: boolean;

  @ApiProperty({ example: 'uuid' })
  sessionId!: string;

  @ApiProperty({ example: 300 })
  expiresIn!: number;

  @ApiProperty({ example: 'A verification code has been sent to your registered email.' })
  message!: string;

  constructor(partial: Partial<MfaRequiredResponseDto>) {
    Object.assign(this, partial);
  }
}
