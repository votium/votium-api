import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class GetElectionCandidaciesQueryDto {
  @ApiProperty({
    example: 'Juan',
    required: false,
    description:
      'Filters candidacies by the candidate first or last name (partial, case-insensitive).',
  })
  @IsOptional()
  @IsString()
  candidateName?: string;

  @ApiProperty({
    example: 'Student Council Election 2026',
    required: false,
    description:
      'Filters candidacies by the election name (partial, case-insensitive). Returns an empty list when it does not match.',
  })
  @IsOptional()
  @IsString()
  electionName?: string;
}
