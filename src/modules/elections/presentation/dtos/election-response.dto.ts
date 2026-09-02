import { ApiProperty } from '@nestjs/swagger';
import { ELECTION_STATUSES, type ElectionStatus } from '../../domain/entities/election.entity';

export class ElectionResponseDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Student Council Election' })
  name!: string;

  @ApiProperty({ example: 'Annual election for the student council.' })
  description!: string;

  @ApiProperty({ example: '2026-08-29', type: 'string', format: 'date' })
  startDate!: string;

  @ApiProperty({ example: '15:00:00' })
  startTime!: string;

  @ApiProperty({ example: '2026-08-30', type: 'string', format: 'date' })
  endDate!: string;

  @ApiProperty({ example: '15:00:00' })
  endTime!: string;

  @ApiProperty({
    example: 'CREATED',
    enum: ELECTION_STATUSES,
  })
  currentStatus!: ElectionStatus;

  @ApiProperty({ example: true })
  blankVoteEnabled!: boolean;

  @ApiProperty({ example: '2026-08-29T15:00:00.000Z', type: 'string', format: 'date-time' })
  createdAt!: string;

  constructor(partial: Partial<ElectionResponseDto>) {
    Object.assign(this, partial);
  }
}
