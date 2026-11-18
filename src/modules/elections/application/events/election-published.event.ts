export class ElectionPublishedEvent {
  constructor(
    public readonly electionId: string,
    public readonly actorId: string,
  ) {}
}
