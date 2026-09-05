import { ApiProperty } from '@nestjs/swagger';

export class CandidacyResponseDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'uuid' })
  electionId!: string;

  @ApiProperty({ example: 'uuid' })
  candidateId!: string;

  @ApiProperty({ example: 1 })
  positionNumber!: number;

  @ApiProperty({ example: null, nullable: true })
  imageUrl!: string | null;

  @ApiProperty({ example: '2026-08-29T15:00:00.000Z', type: 'string', format: 'date-time' })
  createdAt!: string;

  constructor(partial: Partial<CandidacyResponseDto>) {
    Object.assign(this, partial);
  }
}
