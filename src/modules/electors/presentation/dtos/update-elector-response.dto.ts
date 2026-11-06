import { ApiProperty } from '@nestjs/swagger';

export class UpdateElectorResponseDataDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  constructor(partial: Partial<UpdateElectorResponseDataDto>) {
    Object.assign(this, partial);
  }
}

export class UpdateElectorResponseDto {
  @ApiProperty({ example: 'Elector updated successfully.' })
  message!: string;

  @ApiProperty({ type: UpdateElectorResponseDataDto })
  data!: UpdateElectorResponseDataDto;

  constructor(message: string, data: UpdateElectorResponseDataDto) {
    this.message = message;
    this.data = data;
  }
}
