export class ElectionResponseDto {
  id!: string;
  name!: string;
  description!: string;
  startDate!: string;
  startTime!: string;
  endDate!: string;
  endTime!: string;
  currentStatus!: string;
  blankVoteEnabled!: boolean;
  createdAt!: string;

  constructor(partial: Partial<ElectionResponseDto>) {
    Object.assign(this, partial);
  }
}
