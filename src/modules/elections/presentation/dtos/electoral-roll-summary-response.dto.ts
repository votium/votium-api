import { ApiProperty } from '@nestjs/swagger';

export class ElectoralRollSummaryResponseDto {
  @ApiProperty({ example: 'Student Representative Election' })
  electionName!: string;

  @ApiProperty({ example: 1250 })
  registeredVoters!: number;

  constructor(partial: Partial<ElectoralRollSummaryResponseDto>) {
    Object.assign(this, partial);
  }
}
