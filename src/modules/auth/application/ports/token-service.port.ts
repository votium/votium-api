export const TOKEN_SERVICE_PORT = 'TokenServicePort';

export type ActorType = 'USER' | 'ELECTOR';

export interface TokenPayload {
  sub: string;
  email: string;
  actorType: ActorType;
  /** Present only for USER tokens. Absent for ELECTOR tokens. */
  role?: string;
}

export interface TokenServicePort {
  signAccessToken(payload: TokenPayload): Promise<string>;

  verifyAccessToken(token: string): Promise<TokenPayload>;
}
