export abstract class ElectionSigningKeyPort {
  abstract ensureKey(electionId: string): Promise<string>;
}
