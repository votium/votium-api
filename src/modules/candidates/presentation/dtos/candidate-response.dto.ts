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

  @ApiProperty({ example: 'Maria', nullable: true })
  companionFirstName!: string | null;

  @ApiProperty({ example: 'Lopez', nullable: true })
  companionLastName!: string | null;

  @ApiProperty({ example: '20209999', nullable: true })
  companionStudentCode!: string | null;

  @ApiProperty({ example: '9999', nullable: true })
  companionProgramCode!: string | null;

  @ApiProperty({ example: '2000000000', nullable: true })
  companionIdentification!: string | null;

  @ApiProperty({ example: '2026-08-29T15:00:00.000Z', type: 'string', format: 'date-time' })
  createdAt!: string;

  constructor(partial: Partial<CandidateResponseDto>) {
    Object.assign(this, partial);
  }
}
