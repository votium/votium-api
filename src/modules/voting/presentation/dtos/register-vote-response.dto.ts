import { ApiProperty } from '@nestjs/swagger';

export class RegisterVoteResponseDto {
  @ApiProperty({ example: '3f1c8d2e-1b2c-4d3e-9f0a-1b2c3d4e5f6a' })
  electionId!: string;

  @ApiProperty({
    example: '3f1c8d2e-1b2c-4d3e-9f0a-1b2c3d4e5f6a',
    description: 'Selected candidacy UUID, or "blank" for a blank vote.',
  })
  candidacyId!: string;

  @ApiProperty({ example: '2026-09-29T14:03:00.000Z' })
  registeredAt!: string;

  constructor(partial: Partial<RegisterVoteResponseDto>) {
    Object.assign(this, partial);
  }
}
