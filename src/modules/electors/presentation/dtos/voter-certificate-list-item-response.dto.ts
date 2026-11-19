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
    description:
      'Instant the vote was registered (ISO 8601 UTC). Falls back to the scheduled start ' +
      'of the election when the registration time is unknown.',
    example: '2026-11-17T15:04:05.000Z',
    type: 'string',
    format: 'date-time',
  })
  votingDate!: string;

  @ApiProperty({
    description: 'Unique verification code of the certificate.',
    example: '9f86d081884c7d659a2feaa0c55ad015',
  })
  verificationCode!: string;

  @ApiProperty({
    description: 'Instant the certificate was issued (ISO 8601 UTC).',
    example: '2026-11-17T15:05:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  issuedAt!: string;

  constructor(partial: Partial<VoterCertificateListItemResponseDto>) {
    Object.assign(this, partial);
  }
}
