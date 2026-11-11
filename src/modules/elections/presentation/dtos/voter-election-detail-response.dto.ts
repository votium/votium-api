import { ApiProperty } from '@nestjs/swagger';
import { ElectionDetailResponseDto } from './election-detail-response.dto';

export class VoterElectionDetailResponseDto extends ElectionDetailResponseDto {
  @ApiProperty({ example: true })
  hasVoted!: boolean;

  @ApiProperty({
    example: '2026-08-29T15:00:00.000Z',
    type: 'string',
    format: 'date-time',
    nullable: true,
  })
  participationDate!: string | null;

  constructor(partial: Partial<VoterElectionDetailResponseDto>) {
    super(partial);
    Object.assign(this, partial);
  }
}
