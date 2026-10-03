import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ListUsersQueryDto {
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

  @ApiProperty({ example: 'jane', required: false, description: 'Search by first or last name.' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ example: 'ADMINISTRATOR', required: false, enum: ['ADMINISTRATOR', 'AUDITOR'] })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiProperty({ example: 'ACTIVE', required: false, enum: ['ACTIVE', 'DISABLED'] })
  @IsOptional()
  @IsString()
  status?: string;
}
