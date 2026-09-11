import { ApiProperty } from '@nestjs/swagger';

export class CandidateBriefResponseDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Juan' })
  firstName!: string;

  @ApiProperty({ example: 'Garcia' })
  lastName!: string;

  constructor(partial: Partial<CandidateBriefResponseDto>) {
    Object.assign(this, partial);
  }
}

export class CandidacyWithCandidateResponseDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 1 })
  positionNumber!: number;

  @ApiProperty({ example: null, nullable: true })
  imageUrl!: string | null;

  @ApiProperty({ example: '2026-08-29T15:00:00.000Z', type: 'string', format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: CandidateBriefResponseDto })
  candidate!: CandidateBriefResponseDto;

  constructor(partial: Partial<CandidacyWithCandidateResponseDto>) {
    Object.assign(this, partial);
  }
}

export class ElectionCandidaciesResponseDto {
  @ApiProperty({ example: 'Student Council Election 2026' })
  electionName!: string;

  @ApiProperty({ type: [CandidacyWithCandidateResponseDto] })
  candidacies!: CandidacyWithCandidateResponseDto[];

  constructor(partial: Partial<ElectionCandidaciesResponseDto>) {
    Object.assign(this, partial);
  }
}
