import { ApiProperty } from '@nestjs/swagger';

export class RecentActivityResourceDto {
  @ApiProperty({ example: 'Election' })
  type!: string;

  @ApiProperty({ example: 'uuid' })
  name!: string;

  constructor(partial: Partial<RecentActivityResourceDto>) {
    Object.assign(this, partial);
  }
}

export class RecentActivityUserDto {
  @ApiProperty({ example: 'John Doe' })
  name!: string;

  constructor(partial: Partial<RecentActivityUserDto>) {
    Object.assign(this, partial);
  }
}

export class RecentActivityResponseDto {
  @ApiProperty({ example: 'ELECTION_CREATED' })
  action!: string;

  @ApiProperty({ type: RecentActivityResourceDto })
  resource!: RecentActivityResourceDto;

  @ApiProperty({ type: RecentActivityUserDto })
  user!: RecentActivityUserDto;

  @ApiProperty({ example: '2026-10-01T14:30:00.000Z', type: 'string', format: 'date-time' })
  occurredAt!: string;

  constructor(partial: Partial<RecentActivityResponseDto>) {
    Object.assign(this, partial);
  }
}
