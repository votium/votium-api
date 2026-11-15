import { ApiProperty } from '@nestjs/swagger';

export class FinalCandidacyResultResponseDto {
  @ApiProperty({ format: 'uuid', example: '8a7b6c5d-4e3f-2a1b-9c8d-7e6f5a4b3c2d' })
  candidacyId!: string;

  @ApiProperty({ format: 'uuid', example: '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d' })
  candidateId!: string;

  @ApiProperty({ example: 'Ana Pérez', description: 'Candidate first and last name.' })
  candidateName!: string;

  @ApiProperty({ example: 1, description: 'Position on the ballot.' })
  positionNumber!: number;

  @ApiProperty({ example: 6, description: 'Votes received; 0 when none.' })
  votes!: number;

  constructor(partial: Partial<FinalCandidacyResultResponseDto>) {
    Object.assign(this, partial);
  }
}

export class FinalElectionResultsResponseDto {
  @ApiProperty({ format: 'uuid', example: '3f1c2a9e-7b4d-4c1a-9f2e-1a2b3c4d5e6f' })
  electionId!: string;

  @ApiProperty({ example: 'Elección de Consejo Estudiantil 2026' })
  electionName!: string;

  @ApiProperty({ example: 10, description: 'All registered votes, blank votes included.' })
  totalVotes!: number;

  @ApiProperty({ example: 2, description: 'Blank votes, never added to a candidacy.' })
  blankVotes!: number;

  @ApiProperty({
    type: [FinalCandidacyResultResponseDto],
    description: 'Every visible candidacy, ordered by positionNumber ascending.',
  })
  candidacies!: FinalCandidacyResultResponseDto[];

  constructor(partial: Partial<FinalElectionResultsResponseDto>) {
    Object.assign(this, partial);
  }
}
