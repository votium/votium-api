import { ApiProperty } from '@nestjs/swagger';

export class DashboardSummaryResponseDto {
  @ApiProperty({ example: 0 })
  electionsCount!: number;

  @ApiProperty({ example: 0 })
  electorsCount!: number;

  @ApiProperty({ example: 0 })
  candidatesCount!: number;

  constructor(partial: Partial<DashboardSummaryResponseDto>) {
    Object.assign(this, partial);
  }
}
