import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class SearchElectorsQueryDto {
  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiProperty({ example: 10, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 10;

  @ApiProperty({ example: '1234', required: false, description: 'Exactly four digits.' })
  @IsOptional()
  @IsString()
  program_code?: string;

  @ApiProperty({ example: 'E1234', required: false })
  @IsOptional()
  @IsString()
  student_code?: string;

  @ApiProperty({ example: 'Jane', required: false })
  @IsOptional()
  @IsString()
  name?: string;
}
