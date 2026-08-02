import { ApiProperty } from '@nestjs/swagger';

export class AuthTokensResponseDto {
  @ApiProperty({ example: 'jwt-token' })
  accessToken!: string;

  @ApiProperty({ example: 3600 })
  expiresIn!: number;

  constructor(partial: Partial<AuthTokensResponseDto>) {
    Object.assign(this, partial);
  }
}
