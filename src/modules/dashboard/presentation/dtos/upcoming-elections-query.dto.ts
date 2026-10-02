import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional } from 'class-validator';

const ALLOWED_DAYS = [30, 60, 90];

export class UpcomingElectionsQueryDto {
  @ApiProperty({
    example: 30,
    enum: ALLOWED_DAYS,
    default: 30,
    required: false,
    description: 'Future window (in days) in which to look for upcoming elections.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(ALLOWED_DAYS)
  days: number = 30;
}
