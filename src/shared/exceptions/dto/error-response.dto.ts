import { ApiProperty } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({ example: 404 })
  statusCode!: number;

  @ApiProperty({ example: 'USER_NOT_FOUND' })
  error!: string;

  @ApiProperty({ example: 'User not found' })
  message!: string | string[];

  @ApiProperty({ example: '2026-08-29T15:00:00.000Z' })
  timestamp!: string;

  @ApiProperty({ example: '/api/v1/users/uuid' })
  path!: string;

  constructor(partial: Partial<ErrorResponseDto>) {
    Object.assign(this, partial);
  }
}
