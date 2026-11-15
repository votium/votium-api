import { ApiProperty } from '@nestjs/swagger';

export class VoterParticipationResponseDto {
  @ApiProperty({
    example: 3,
    description: 'ACTIVE elections of the voter roll where the voter already voted.',
  })
  participatedElections!: number;

  @ApiProperty({
    example: 5,
    description: 'ACTIVE elections whose electoral roll includes the voter.',
  })
  activeElections!: number;

  @ApiProperty({
    example: 60,
    description: 'participatedElections / activeElections * 100 (2 decimals; 0 if none).',
  })
  participation!: number;

  constructor(props: VoterParticipationResponseDto) {
    this.participatedElections = props.participatedElections;
    this.activeElections = props.activeElections;
    this.participation = props.participation;
  }
}
