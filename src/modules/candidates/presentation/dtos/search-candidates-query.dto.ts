import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class SearchCandidatesQueryDto {
  @ApiProperty({ example: 'Juan', required: false })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiProperty({ example: 'Garcia', required: false })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiProperty({ example: '1234', required: false, description: 'Exactly four digits.' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/, { message: 'Program code must contain exactly four digits.' })
  studyPlanCode?: string;

  @ApiProperty({ example: 'CAND-1234', required: false })
  @IsOptional()
  @IsString()
  studentCode?: string;

  @ApiProperty({ example: 'ID-12345678', required: false })
  @IsOptional()
  @IsString()
  identificationNumber?: string;
}
