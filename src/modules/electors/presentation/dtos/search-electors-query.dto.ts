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

  @ApiProperty({
    example: '2710',
    required: false,
    description: 'Partial match on the program code.',
  })
  @IsOptional()
  @IsString()
  programCode?: string;

  @ApiProperty({
    example: '202012345',
    required: false,
    description: 'Partial match on the student code.',
  })
  @IsOptional()
  @IsString()
  studentCode?: string;

  @ApiProperty({
    example: 'Jane',
    required: false,
    description: 'Partial, case-insensitive match on the first or last name.',
  })
  @IsOptional()
  @IsString()
  name?: string;
}
