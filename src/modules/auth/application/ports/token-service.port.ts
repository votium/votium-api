export const TOKEN_SERVICE_PORT = 'TokenServicePort';

export interface TokenPayload {
  sub: string;
  email: string;
  role: string;
}

export interface TokenServicePort {
  signAccessToken(payload: TokenPayload): Promise<string>;

  verifyAccessToken(token: string): Promise<TokenPayload>;
}
