import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssociateCandidacyDto {
  @ApiProperty({ example: 'uuid', description: 'Identifier of the existing global candidate.' })
  @IsUUID()
  candidateId!: string;
}
