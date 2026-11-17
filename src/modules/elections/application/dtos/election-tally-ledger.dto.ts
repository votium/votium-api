import { Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsNumber, IsPositive, IsString, ValidateNested } from 'class-validator';
import {
  type ElectionStatusType,
  ELECTION_STATUS_VALUES,
} from '../../domain/value-objects/election-status.vo';

export class ElectionResultsData {
  @IsString()
  @IsNotEmpty()
  candidateId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsNumber()
  @IsNotEmpty()
  @IsPositive()
  votes!: number;
}

export class ElectionTallyLedgerDto {
  @IsNumber()
  @IsNotEmpty()
  total!: number;

  @ValidateNested()
  @Type(() => ElectionResultsData)
  results!: Array<ElectionResultsData>;

  @IsIn(ELECTION_STATUS_VALUES)
  status!: ElectionStatusType;
}
