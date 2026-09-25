import { ApiProperty } from '@nestjs/swagger';

export class ElectorResponseDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Jane' })
  firstName!: string;

  @ApiProperty({ example: 'Doe' })
  lastName!: string;

  @ApiProperty({ example: 'jane.doe@example.com' })
  email!: string;

  @ApiProperty({ example: 'E1234' })
  studentCode!: string;

  @ApiProperty({ example: '1234' })
  programCode!: string;

  @ApiProperty({ example: 'ACTIVE', enum: ['ACTIVE', 'INACTIVE'] })
  status!: string;

  @ApiProperty({ example: '2026-08-29T15:00:00.000Z', type: 'string', format: 'date-time' })
  createdAt!: string;

  constructor(partial: Partial<ElectorResponseDto>) {
    Object.assign(this, partial);
  }
}
