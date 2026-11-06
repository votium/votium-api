// The message the server blind-signs and later verifies: "<electionId>|<ballotId>".
// ballotId is a fresh random UUID chosen by the client, which supplies the randomness that
// the deterministic RSABSSA variant relies on.
export function buildBallotMessage(electionId: string, ballotId: string): Uint8Array {
  return new TextEncoder().encode(`${electionId}|${ballotId}`);
}
