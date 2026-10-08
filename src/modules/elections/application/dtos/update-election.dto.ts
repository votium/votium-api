import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

function trimValue(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const TIME_FORMAT = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

// Complete-update request for PUT /api/v1/elections/:id. The configurable election
// information (name, description, start/end date/time) mirrors the creation contract:
// these fields are required. `blankVoteEnabled` is genuinely optional (it has a domain
// default of `false`) and remains the only optional field. System-managed fields
// (`id`, `currentStatus`, `createdAt`, etc.) are intentionally absent and are rejected
// by the global ValidationPipe (whitelist + forbidNonWhitelisted).
export class UpdateElectionDto {
  @ApiProperty({ example: 'Student Council Election' })
  @Transform(({ value }) => trimValue(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'Annual election for the student council.' })
  @Transform(({ value }) => trimValue(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  description!: string;

  @ApiProperty({
    example: '2026-08-29',
    description: 'Start date in YYYY-MM-DD format.',
  })
  @IsString()
  @Matches(DATE_FORMAT, {
    message: 'startDate must be a valid calendar date in YYYY-MM-DD format.',
  })
  startDate!: string;

  @ApiProperty({
    example: '15:00:00',
    description: 'Start time in HH:mm[:ss] format.',
  })
  @IsString()
  @Matches(TIME_FORMAT, {
    message: 'startTime must be a valid time in HH:mm[:ss] format.',
  })
  startTime!: string;

  @ApiProperty({
    example: '2026-08-30',
    description: 'End date in YYYY-MM-DD format.',
  })
  @IsString()
  @Matches(DATE_FORMAT, {
    message: 'endDate must be a valid calendar date in YYYY-MM-DD format.',
  })
  endDate!: string;

  @ApiProperty({
    example: '15:00:00',
    description: 'End time in HH:mm[:ss] format.',
  })
  @IsString()
  @Matches(TIME_FORMAT, {
    message: 'endTime must be a valid time in HH:mm[:ss] format.',
  })
  endTime!: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  blankVoteEnabled?: boolean;
}
