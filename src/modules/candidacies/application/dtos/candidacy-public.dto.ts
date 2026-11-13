import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  MaxLength,
  Matches,
  IsOptional,
  ValidateNested,
  IsUUID,
  IsEmail,
  IsNumber,
} from 'class-validator';

export class ElectionDataDto {
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @IsOptional()
  name!: string | null;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsOptional()
  startDate!: string | null;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsOptional()
  endDate!: string | null;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{2}:\d{2}:\d{2}$/)
  @IsOptional()
  startTime!: string | null;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{2}:\d{2}:\d{2}$/)
  @IsOptional()
  endTime!: string | null;

  @IsNotEmpty()
  @IsString()
  @IsOptional()
  status!: string | null;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  signingPublicKey!: string | null;
}

export class CandidateDataDto {
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  id!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  @IsEmail()
  @IsOptional()
  email!: string | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(9)
  @IsOptional()
  studentCode!: string | null;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  status!: string | null;
}

export class CandidacyPublicDto {
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  id!: string;

  @IsNumber()
  @IsNotEmpty()
  positionNumber!: number;

  @ValidateNested()
  @Type(() => ElectionDataDto)
  @IsOptional()
  election!: ElectionDataDto | null;

  @ValidateNested()
  @Type(() => CandidateDataDto)
  candidate!: CandidateDataDto;
}
