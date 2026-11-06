import { ApiProperty } from '@nestjs/swagger';
import { Length, Matches } from 'class-validator';

export class BallotCredentialRequestDto {
  @ApiProperty({ description: 'Schnorr public key y: Ristretto255 encoding, 64 lowercase hex.' })
  @Matches(/^[0-9a-f]{64}$/, { message: 'y must be 64 lowercase hex characters' })
  y!: string;

  @ApiProperty({
    description:
      "Blinded message M' (256 bytes, 512 lowercase hex). The ballotId never reaches the server.",
  })
  @Length(512, 512, { message: 'blindedMessageHex must be 512 hex characters' })
  @Matches(/^[0-9a-f]+$/, { message: 'blindedMessageHex must be lowercase hex' })
  blindedMessageHex!: string;
}
