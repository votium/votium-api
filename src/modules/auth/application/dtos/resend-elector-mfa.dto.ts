import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ResendElectorMfaDto {
  @ApiProperty({ example: 'uuid' })
  @IsUUID()
  sessionId!: string;
}
