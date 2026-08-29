import { ApiProperty } from '@nestjs/swagger';

export class CandidateResponseDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Juan' })
  firstName!: string;

  @ApiProperty({ example: 'Garcia' })
  lastName!: string;

  @ApiProperty({ example: 'CAND-1234' })
  studentCode!: string;

  @ApiProperty({ example: '1234' })
  programCode!: string;

  @ApiProperty({ example: 'ID-12345678' })
  identificationNumber!: string;

  @ApiProperty({ example: 'ACTIVE', enum: ['ACTIVE', 'INACTIVE'] })
  status!: string;

  @ApiProperty({ example: '2026-08-29T15:00:00.000Z', type: 'string', format: 'date-time' })
  createdAt!: string;

  constructor(partial: Partial<CandidateResponseDto>) {
    Object.assign(this, partial);
  }
}
