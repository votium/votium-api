import { ApiProperty } from '@nestjs/swagger';

export class AuthTokensResponseDto {
  @ApiProperty({ example: 3600 })
  expiresIn!: number;

  constructor(partial: Partial<AuthTokensResponseDto>) {
    Object.assign(this, partial);
  }
}
