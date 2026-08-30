import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Jane' })
  firstName!: string;

  @ApiProperty({ example: 'Doe' })
  lastName!: string;

  @ApiProperty({ example: 'jane.doe@example.com' })
  email!: string;

  @ApiProperty({
    description: 'Role assigned to the user.',
    example: { id: 'uuid', name: 'ADMINISTRATOR' },
    type: 'object',
    properties: {
      id: { type: 'string', example: 'uuid' },
      name: { type: 'string', example: 'ADMINISTRATOR' },
    },
  })
  role!: { id: string; name: string };

  @ApiProperty({ example: 'ACTIVE', enum: ['ACTIVE', 'DISABLED'] })
  status!: string;

  @ApiProperty({ example: '2026-08-29T15:00:00.000Z', type: 'string', format: 'date-time' })
  createdAt!: string;

  @ApiProperty({
    example: '2026-08-29T15:00:00.000Z',
    type: 'string',
    format: 'date-time',
    required: false,
  })
  updatedAt?: string;

  constructor(partial: Partial<UserResponseDto>) {
    Object.assign(this, partial);
  }
}
