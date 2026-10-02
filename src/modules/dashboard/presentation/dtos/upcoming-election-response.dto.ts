import { ApiProperty } from '@nestjs/swagger';

export class UpcomingElectionResponseDto {
  @ApiProperty({ example: 'Student Council Election' })
  name!: string;

  @ApiProperty({ example: '2026-10-15T08:00:00.000Z', type: 'string', format: 'date-time' })
  startDate!: string;

  @ApiProperty({ example: '29d 23h 59m' })
  timeUntilStart!: string;

  @ApiProperty({ example: 100 })
  configurationPercentage!: number;

  constructor(partial: Partial<UpcomingElectionResponseDto>) {
    Object.assign(this, partial);
  }
}
