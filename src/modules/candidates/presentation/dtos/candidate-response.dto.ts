export class CandidateResponseDto {
  id!: string;
  firstName!: string;
  lastName!: string;
  studentCode!: string;
  programCode!: string;
  identificationNumber!: string;
  status!: string;
  createdAt!: string;

  constructor(partial: Partial<CandidateResponseDto>) {
    Object.assign(this, partial);
  }
}
