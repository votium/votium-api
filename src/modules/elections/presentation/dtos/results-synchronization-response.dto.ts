import { ApiProperty } from '@nestjs/swagger';

export class ResultsSynchronizationResponseDto {
  @ApiProperty({ format: 'uuid', example: '3f1c2a9e-7b4d-4c1a-9f2e-1a2b3c4d5e6f' })
  electionId!: string;

  @ApiProperty({ example: true, description: 'true once the synchronization completed.' })
  synchronized!: boolean;

  @ApiProperty({
    example: 3,
    description: 'Candidacies written to results, including those with 0 votes.',
  })
  candidaciesSynchronized!: number;

  @ApiProperty({ example: 12, description: 'Sum of the synchronized votes per candidacy.' })
  totalVotes!: number;

  constructor(partial: Partial<ResultsSynchronizationResponseDto>) {
    Object.assign(this, partial);
  }
}
