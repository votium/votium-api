export class ElectorResponseDto {
  id!: string;
  firstName!: string;
  lastName!: string;
  email!: string;
  studentCode!: string;
  programCode!: string;
  status!: string;
  createdAt!: string;

  constructor(partial: Partial<ElectorResponseDto>) {
    Object.assign(this, partial);
  }
}
