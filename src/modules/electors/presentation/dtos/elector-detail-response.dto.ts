import { ApiProperty } from '@nestjs/swagger';

export class ElectorElectionDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Student Council Election 2026' })
  name!: string;

  @ApiProperty({ example: 'ACTIVE', enum: ['CREATED', 'PENDING', 'PUBLISHED', 'CLOSED', 'ACTIVE'] })
  status!: string;

  @ApiProperty({ example: true })
  isEligible!: boolean;

  @ApiProperty({ example: false })
  hasVoted!: boolean;

  constructor(partial: Partial<ElectorElectionDto>) {
    Object.assign(this, partial);
  }
}

export class ElectorDetailResponseDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Jane' })
  firstName!: string;

  @ApiProperty({ example: 'Doe' })
  lastName!: string;

  @ApiProperty({ example: '123456789', nullable: true })
  identification!: string | null;

  @ApiProperty({ example: 'E1234' })
  studentCode!: string;

  @ApiProperty({ example: '2710' })
  programCode!: string;

  @ApiProperty({ example: 'jane.doe@example.com' })
  email!: string;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: '2026-08-29T15:00:00.000Z', type: 'string', format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ example: '2026-08-30T15:00:00.000Z', type: 'string', format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({ type: ElectorElectionDto, isArray: true })
  elections!: ElectorElectionDto[];

  constructor(partial: Partial<ElectorDetailResponseDto>) {
    Object.assign(this, partial);
  }
}
