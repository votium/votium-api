import { ApiProperty } from '@nestjs/swagger';

export class HasVotedResponseDto {
  @ApiProperty({
    example: '22222222-2222-4222-8222-222222222222',
    description: 'Unique identifier of the election.',
  })
  electionId!: string;

  @ApiProperty({
    example: '11111111-1111-4111-8111-111111111111',
    description: 'Unique identifier of the elector.',
  })
  electorId!: string;

  @ApiProperty({ example: true, description: 'Whether the elector already voted in the election.' })
  hasVoted!: boolean;

  constructor(props: HasVotedResponseDto) {
    this.electionId = props.electionId;
    this.electorId = props.electorId;
    this.hasVoted = props.hasVoted;
  }
}
