import { ApiProperty } from '@nestjs/swagger';

export class MeUserPayloadDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'ADMINISTRATOR', enum: ['ADMINISTRATOR', 'AUDITOR'] })
  role!: string;

  @ApiProperty({ example: 'Jane Doe' })
  name!: string;

  @ApiProperty({ example: 'jane.doe@example.com' })
  email!: string;
}

export class MeUserResponseDto {
  @ApiProperty({ type: MeUserPayloadDto })
  user!: MeUserPayloadDto;

  constructor(partial: Partial<MeUserResponseDto>) {
    Object.assign(this, partial);
  }
}
