import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsString, ValidateNested } from 'class-validator';

export class RegisterElectoralRollDataDto {
  @IsNumber()
  @IsNotEmpty()
  received!: number;

  @IsNumber()
  @IsNotEmpty()
  skipped!: number;

  @IsNumber()
  @IsNotEmpty()
  inserted!: number;
}

export class RegisterElectoralRollLedgerResultDto {
  @IsString()
  @IsNotEmpty()
  txId!: string | undefined;

  @IsNumber()
  @IsNotEmpty()
  blockNumber!: number | null | undefined;

  @ValidateNested()
  @Type(() => RegisterElectoralRollDataDto)
  data!: RegisterElectoralRollDataDto;
}
