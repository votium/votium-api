import { ApiProperty } from '@nestjs/swagger';

export class VotingCertificateResponseDto {
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

  @ApiProperty({ description: 'Full name of the voter.', example: 'Ana María Pérez' })
  voterName!: string;

  @ApiProperty({ description: 'Student code of the voter.', example: '202012345' })
  voterCode!: string;

  @ApiProperty({
    description: 'Unique, stable verification code of this certificate.',
    example: '9f86d081884c7d659a2feaa0c55ad015',
  })
  verificationCode!: string;

  constructor(partial: Partial<VotingCertificateResponseDto>) {
    Object.assign(this, partial);
  }
}
