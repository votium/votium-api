export class ElectionValidatedEvent {
  constructor(
    public readonly electionId: string,
    public readonly actorId: string,
  ) {}
}
