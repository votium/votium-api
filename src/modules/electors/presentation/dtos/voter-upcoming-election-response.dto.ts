import { ApiProperty } from '@nestjs/swagger';
import { ElectionResponseDto } from 'src/modules/elections/presentation/dtos/election-response.dto';

export class VoterUpcomingElectionResponseDto extends ElectionResponseDto {
  @ApiProperty({ example: 250, description: 'Registered voters who already voted.' })
  participantsCount!: number;

  @ApiProperty({ example: 1000, description: 'Total voters in the electoral roll.' })
  registeredVotersCount!: number;

  @ApiProperty({
    example: 25,
    description: 'participantsCount / registeredVotersCount * 100 (2 decimals; 0 if empty roll).',
  })
  participationPercentage!: number;

  @ApiProperty({ example: false, description: 'Whether the authenticated voter already voted.' })
  hasVoted!: boolean;

  constructor(partial: Partial<VoterUpcomingElectionResponseDto>) {
    super(partial);
    Object.assign(this, partial);
  }
}
