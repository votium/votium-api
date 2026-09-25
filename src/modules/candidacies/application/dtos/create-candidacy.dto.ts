import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateCandidacyDto {
  @ApiProperty({ example: 'uuid', description: 'Identifier of the election.' })
  @IsUUID()
  electionId!: string;

  @ApiProperty({ example: 'uuid', description: 'Identifier of the candidate.' })
  @IsUUID()
  candidateId!: string;
}
