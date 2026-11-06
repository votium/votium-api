import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsUUID, Length, Matches, ValidateNested } from 'class-validator';

const CANDIDACY_OR_BLANK = /^(blank|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
const HEX_64 = /^[0-9a-f]{64}$/;

export class SchnorrProofDto {
  @ApiProperty({ description: 'Public key y (64 hex).' })
  @Matches(HEX_64, { message: 'proof.y must be 64 lowercase hex characters' })
  y!: string;

  @ApiProperty({ description: 'Commitment t (64 hex).' })
  @Matches(HEX_64, { message: 'proof.t must be 64 lowercase hex characters' })
  t!: string;

  @ApiProperty({ description: 'Challenge c (64 hex).' })
  @Matches(HEX_64, { message: 'proof.c must be 64 lowercase hex characters' })
  c!: string;

  @ApiProperty({ description: 'Response s (64 hex).' })
  @Matches(HEX_64, { message: 'proof.s must be 64 lowercase hex characters' })
  s!: string;
}

export class AnonymousVoteRequestDto {
  @ApiProperty({ description: 'Candidacy UUID, or "blank".' })
  @Matches(CANDIDACY_OR_BLANK, { message: 'candidacyId must be a UUID or "blank"' })
  candidacyId!: string;

  @ApiProperty({ description: 'Random UUID v4 chosen by the client.' })
  @IsUUID('4', { message: 'ballotId must be a UUID v4' })
  ballotId!: string;

  @ApiProperty({ description: 'Unblinded RSA signature S (512 lowercase hex).' })
  @Length(512, 512, { message: 'signatureHex must be 512 hex characters' })
  @Matches(/^[0-9a-f]+$/, { message: 'signatureHex must be lowercase hex' })
  signatureHex!: string;

  @ApiProperty({ type: SchnorrProofDto })
  @ValidateNested()
  @Type(() => SchnorrProofDto)
  proof!: SchnorrProofDto;
}
