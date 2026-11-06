import { ApiProperty } from '@nestjs/swagger';

export class ElectionStatusCountsResponseDto {
  @ApiProperty({ example: 0 })
  pending!: number;

  @ApiProperty({ example: 0 })
  created!: number;

  @ApiProperty({ example: 0 })
  active!: number;

  @ApiProperty({ example: 0 })
  closed!: number;

  @ApiProperty({ example: 0 })
  published!: number;

  constructor(partial: Partial<ElectionStatusCountsResponseDto>) {
    Object.assign(this, partial);
  }
}
