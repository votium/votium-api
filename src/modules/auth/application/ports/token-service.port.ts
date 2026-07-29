export interface TokenServicePort {
  signAccessToken(payload: { sub: string; email: string; role: string }): Promise<string>;

  verifyAccessToken(token: string): Promise<{
    sub: string;
    email: string;
    role: string;
  }>;
}
