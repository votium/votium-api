import { ApiProperty } from '@nestjs/swagger';

export class AuditLogResponseDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'uuid', description: 'User that produced the event (user_id).' })
  userId!: string;

  @ApiProperty({ example: 'USER_CREATED' })
  action!: string;

  @ApiProperty({
    example: 'Appeal accepted',
    nullable: true,
    type: String,
    description: 'Reason associated with the action (may be null).',
  })
  reason!: string | null;

  @ApiProperty({
    example: '{"userId":"uuid"}',
    nullable: true,
    type: String,
    description: 'Raw JSON string preserved verbatim; never parsed.',
  })
  details!: string | null;

  @ApiProperty({ example: '2026-11-10T15:00:00.000Z', type: 'string', format: 'date-time' })
  timestamp!: string;

  constructor(partial: Partial<AuditLogResponseDto>) {
    Object.assign(this, partial);
  }
}
