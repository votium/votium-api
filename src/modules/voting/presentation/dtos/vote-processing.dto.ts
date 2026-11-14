import { IsString, Matches, MaxLength } from 'class-validator';

export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const HASH_RE = /^[0-9a-f]{64}$/;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

export class ElectionParamDto {
  @IsString() @Matches(ID_RE) electionId!: string;
}

export class SignBlindedDto {
  @IsString()
  @Matches(BASE64_RE)
  @MaxLength(1400)
  blindedMessage!: string;
}

export class CastVoteRequestDto {
  @IsString()
  @Matches(ID_RE)
  candidateId!: string;

  @IsString()
  @Matches(HASH_RE) // 64 caracteres hex, aleatorio del cliente
  nullifier!: string;

  @IsString()
  @Matches(BASE64_RE)
  @MaxLength(2048)
  signature!: string;
}
