import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ResendMfaDto {
  @ApiProperty({ example: 'uuid' })
  @IsUUID()
  sessionId!: string;
}
