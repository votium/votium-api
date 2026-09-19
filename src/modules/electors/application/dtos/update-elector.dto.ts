import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

function trimValue(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateElectorDto {
  @ApiProperty({ example: 'Jane' })
  @Transform(({ value }) => trimValue(value))
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ example: 'Doe' })
  @Transform(({ value }) => trimValue(value))
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  lastName!: string;

  @ApiProperty({ example: '123456789', nullable: true })
  @Transform(({ value }) => trimValue(value))
  @IsString()
  @IsNotEmpty()
  identification!: string;

  @ApiProperty({ example: 'E1234' })
  @Transform(({ value }) => trimValue(value))
  @IsString()
  @IsNotEmpty()
  studentCode!: string;

  @ApiProperty({ example: '2710', description: 'Exactly four digits.' })
  @Transform(({ value }) => trimValue(value))
  @IsString()
  @Matches(/^\d{4}$/, { message: 'Program code must contain exactly four digits.' })
  programCode!: string;

  @ApiProperty({ example: 'jane.doe@example.com' })
  @Transform(({ value }) => trimValue(value))
  @IsEmail()
  email!: string;
}
