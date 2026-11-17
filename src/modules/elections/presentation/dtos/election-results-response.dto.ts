import { ApiProperty } from '@nestjs/swagger';
import {
  ElectionStatusType,
  ELECTION_STATUS_VALUES,
} from '../../domain/value-objects/election-status.vo';

export class ElectionResultsResponseDto {
  @ApiProperty({ example: 'uuid' })
  electionId!: string;

  @ApiProperty({ example: 240 })
  total!: number;

  @ApiProperty({ example: 1250, description: 'Registered voters in the electoral roll.' })
  registeredVoters!: number;

  @ApiProperty({ example: ELECTION_STATUS_VALUES[4] })
  electionStatus!: ElectionStatusType[4];

  @ApiProperty({
    example: [
      {
        candidateId: 'uuid',
        name: 'John Doe',
        votes: 120,
      },
    ],
  })
  candidacies!: Array<{
    candidateId: string;
    name: string;
    votes: number;
  }>;
}
