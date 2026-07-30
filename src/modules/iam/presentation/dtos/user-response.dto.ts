export class UserResponseDto {
  id!: string;
  firstName!: string;
  lastName!: string;
  email!: string;
  role!: { id: string; name: string };
  status!: string;
  createdAt!: string;
  updatedAt?: string;

  constructor(partial: Partial<UserResponseDto>) {
    Object.assign(this, partial);
  }
}
