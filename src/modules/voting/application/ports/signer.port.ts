export abstract class SignerPort {
  abstract signBlinded(electionId: string, blindedB64: string): Promise<string>;

  abstract verify(
    electionId: string,
    publicKeyPem: string,
    nullifier: string,
    sigB64: string,
  ): Promise<boolean>;
}
