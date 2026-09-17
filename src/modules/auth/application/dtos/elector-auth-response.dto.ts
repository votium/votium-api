import { ApiProperty } from '@nestjs/swagger';

export class ElectorAuthResponseDto {
  @ApiProperty({ example: 'jwt-token' })
  accessToken!: string;

  @ApiProperty({ example: 3600 })
  expiresIn!: number;

  constructor(partial: Partial<ElectorAuthResponseDto>) {
    Object.assign(this, partial);
  }
}
