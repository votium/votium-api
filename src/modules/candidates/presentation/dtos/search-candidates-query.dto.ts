import { IsOptional, IsString, Matches } from 'class-validator';

export class SearchCandidatesQueryDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/, { message: 'Program code must contain exactly four digits.' })
  studyPlanCode?: string;

  @IsOptional()
  @IsString()
  studentCode?: string;

  @IsOptional()
  @IsString()
  identificationNumber?: string;
}
