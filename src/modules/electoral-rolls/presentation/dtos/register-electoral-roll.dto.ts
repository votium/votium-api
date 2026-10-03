import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

export class RegisterElectoralRollEntryDto {
  @ApiProperty({ example: '202012345' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  studentCode!: string;

  @ApiProperty({ example: '2710', description: 'Exactly four digits. Whitespace is trimmed.' })
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(/^\d{4}$/, { message: 'Program code must contain exactly four digits.' })
  programCode!: string;
}

export class RegisterElectoralRollDto {
  @ApiProperty({ type: [RegisterElectoralRollEntryDto], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RegisterElectoralRollEntryDto)
  electors!: RegisterElectoralRollEntryDto[];
}
