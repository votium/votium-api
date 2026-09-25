import { ApiProperty } from '@nestjs/swagger';

export class MeElectorPayloadDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'ELECTOR' })
  role!: string;

  @ApiProperty({ example: 'Jane Doe' })
  name!: string;

  @ApiProperty({ example: 'jane.doe@example.com' })
  email!: string;
}

export class MeElectorResponseDto {
  @ApiProperty({ type: MeElectorPayloadDto })
  user!: MeElectorPayloadDto;

  constructor(partial: Partial<MeElectorResponseDto>) {
    Object.assign(this, partial);
  }
}
