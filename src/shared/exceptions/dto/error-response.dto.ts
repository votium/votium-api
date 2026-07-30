export class ErrorResponseDto {
  statusCode!: number;
  error!: string;
  message!: string | string[];
  timestamp!: string;
  path!: string;

  constructor(partial: Partial<ErrorResponseDto>) {
    Object.assign(this, partial);
  }
}
