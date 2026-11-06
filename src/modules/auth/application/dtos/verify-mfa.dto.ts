import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Matches } from 'class-validator';

export class VerifyMfaDto {
  @ApiProperty({ example: 'uuid' })
  @IsUUID()
  sessionId!: string;

  @ApiProperty({ example: '483912' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be exactly 6 digits' })
  code!: string;
}
