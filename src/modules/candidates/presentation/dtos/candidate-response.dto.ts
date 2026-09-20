import { ApiProperty } from '@nestjs/swagger';

export class CandidateElectionDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Elección 2026' })
  name!: string;

  @ApiProperty({
    example: 'PUBLISHED',
    enum: ['CREATED', 'PENDING', 'PUBLISHED', 'CLOSED', 'ACTIVE'],
  })
  status!: string;

  @ApiProperty({ example: '2026-09-01', type: 'string', format: 'date' })
  startDate!: string;

  @ApiProperty({ example: '08:00:00.000Z', type: 'string', format: 'time' })
  startTime!: string;

  @ApiProperty({ example: '2026-09-02', type: 'string', format: 'date' })
  endDate!: string;

  @ApiProperty({ example: '20:00:00.000Z', type: 'string', format: 'time' })
  endTime!: string;

  @ApiProperty({
    example: false,
    description: 'True if current time is within election schedule window',
  })
  isScheduleActive!: boolean;

  constructor(partial: Partial<CandidateElectionDto>) {
    Object.assign(this, partial);
  }
}

export class CandidateDetailResponseDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Juan' })
  firstName!: string;

  @ApiProperty({ example: 'Garcia' })
  lastName!: string;

  @ApiProperty({ example: 'CAND-1234' })
  studentCode!: string;

  @ApiProperty({ example: '1234' })
  programCode!: string;

  @ApiProperty({ example: 'ID-12345678' })
  identificationNumber!: string;

  @ApiProperty({ example: 'ACTIVE', enum: ['ACTIVE', 'INACTIVE'] })
  status!: string;

  @ApiProperty({ example: 'Maria', nullable: true })
  companionFirstName!: string | null;

  @ApiProperty({ example: 'Lopez', nullable: true })
  companionLastName!: string | null;

  @ApiProperty({ example: '20209999', nullable: true })
  companionStudentCode!: string | null;

  @ApiProperty({ example: '9999', nullable: true })
  companionProgramCode!: string | null;

  @ApiProperty({ example: '2000000000', nullable: true })
  companionIdentification!: string | null;

  @ApiProperty({ example: '2026-08-29T15:00:00.000Z', type: 'string', format: 'date-time' })
  createdAt!: string;

  @ApiProperty({
    type: [CandidateElectionDto],
    description: 'Elections the candidate has participated in',
  })
  elections!: CandidateElectionDto[];

  @ApiProperty({
    example: false,
    description: 'True if candidate is currently in a schedule-active election',
  })
  isCurrentlyActive!: boolean;

  constructor(partial: Partial<CandidateDetailResponseDto>) {
    Object.assign(this, partial);
  }
}

// Keep backward compatibility
export class CandidateResponseDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Juan' })
  firstName!: string;

  @ApiProperty({ example: 'Garcia' })
  lastName!: string;

  @ApiProperty({ example: 'CAND-1234' })
  studentCode!: string;

  @ApiProperty({ example: '1234' })
  programCode!: string;

  @ApiProperty({ example: 'ID-12345678' })
  identificationNumber!: string;

  @ApiProperty({ example: 'ACTIVE', enum: ['ACTIVE', 'INACTIVE'] })
  status!: string;

  @ApiProperty({ example: 'Maria', nullable: true })
  companionFirstName!: string | null;

  @ApiProperty({ example: 'Lopez', nullable: true })
  companionLastName!: string | null;

  @ApiProperty({ example: '20209999', nullable: true })
  companionStudentCode!: string | null;

  @ApiProperty({ example: '9999', nullable: true })
  companionProgramCode!: string | null;

  @ApiProperty({ example: '2000000000', nullable: true })
  companionIdentification!: string | null;

  @ApiProperty({ example: '2026-08-29T15:00:00.000Z', type: 'string', format: 'date-time' })
  createdAt!: string;

  constructor(partial: Partial<CandidateResponseDto>) {
    Object.assign(this, partial);
  }
}
