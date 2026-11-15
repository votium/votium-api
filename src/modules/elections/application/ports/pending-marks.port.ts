export abstract class PendingMarksPort {
  abstract flush(electionId: string): Promise<void>;
  abstract pending(electionId: string): Promise<number>;
}
