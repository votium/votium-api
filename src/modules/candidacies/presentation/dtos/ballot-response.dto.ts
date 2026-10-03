import { ApiProperty } from '@nestjs/swagger';
import { CandidacyWithCandidateResponseDto } from './election-candidacies-response.dto';

export class BlankVoteDto {
  @ApiProperty({ example: 'blank' })
  id!: string;

  @ApiProperty({ example: true })
  enabled!: boolean;

  constructor(partial: Partial<BlankVoteDto>) {
    Object.assign(this, partial);
  }
}

export class BallotElectionDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Student Council Election 2026' })
  name!: string;

  constructor(partial: Partial<BallotElectionDto>) {
    Object.assign(this, partial);
  }
}

export class BallotResponseDto {
  @ApiProperty({ type: BallotElectionDto })
  election!: BallotElectionDto;

  @ApiProperty({ type: [CandidacyWithCandidateResponseDto] })
  candidacies!: CandidacyWithCandidateResponseDto[];

  @ApiProperty({ type: BlankVoteDto })
  blankVote!: BlankVoteDto;

  constructor(partial: Partial<BallotResponseDto>) {
    Object.assign(this, partial);
  }
}
