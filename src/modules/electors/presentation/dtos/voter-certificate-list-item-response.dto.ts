import { ApiProperty } from '@nestjs/swagger';

export class VoterCertificateListItemResponseDto {
  @ApiProperty({ description: 'Unique identifier of the election.', example: 'uuid' })
  electionId!: string;

  @ApiProperty({
    description: 'Name of the election.',
    example: 'Elección de Representantes Estudiantiles 2026',
  })
  electionName!: string;

  @ApiProperty({
    description: 'Scheduled start of the election (ISO 8601 UTC).',
    example: '2026-11-17T15:04:05.000Z',
    type: 'string',
    format: 'date-time',
  })
  votingDate!: string;

  @ApiProperty({
    description: 'AVAILABLE can be downloaded; PROCESSING awaits ledger confirmation.',
    enum: ['AVAILABLE', 'PROCESSING'],
    example: 'AVAILABLE',
  })
  status!: 'AVAILABLE' | 'PROCESSING';

  @ApiProperty({
    description: 'Verification code, or null until the certificate is generated.',
    example: '9f86d081884c7d659a2feaa0c55ad015',
    type: 'string',
    nullable: true,
  })
  verificationCode!: string | null;

  @ApiProperty({
    description: 'Instant the certificate was issued, or null until it is generated.',
    example: '2026-11-17T15:05:00.000Z',
    type: 'string',
    format: 'date-time',
    nullable: true,
  })
  issuedAt!: string | null;

  constructor(partial: Partial<VoterCertificateListItemResponseDto>) {
    Object.assign(this, partial);
  }
}
