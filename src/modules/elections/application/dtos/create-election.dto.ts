import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

function trimValue(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const TIME_FORMAT = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export class CreateElectionDto {
  @Transform(({ value }) => trimValue(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @Transform(({ value }) => trimValue(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  description!: string;

  @IsString()
  @Matches(DATE_FORMAT, {
    message: 'startDate must be a valid calendar date in YYYY-MM-DD format.',
  })
  startDate!: string;

  @IsString()
  @Matches(TIME_FORMAT, {
    message: 'startTime must be a valid time in HH:mm[:ss] format.',
  })
  startTime!: string;

  @IsString()
  @Matches(DATE_FORMAT, {
    message: 'endDate must be a valid calendar date in YYYY-MM-DD format.',
  })
  endDate!: string;

  @IsString()
  @Matches(TIME_FORMAT, {
    message: 'endTime must be a valid time in HH:mm[:ss] format.',
  })
  endTime!: string;

  @IsOptional()
  @IsBoolean()
  blankVoteEnabled?: boolean;
}
