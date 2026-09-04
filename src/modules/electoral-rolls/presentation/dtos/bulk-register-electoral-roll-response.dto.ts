import { ApiProperty } from '@nestjs/swagger';

export class BulkRegisterElectoralRollErrorDto {
  @ApiProperty({ example: 14 })
  row!: number;

  @ApiProperty({ example: 'Elector not found for the provided student code and program code.' })
  reason!: string;

  constructor(partial: Partial<BulkRegisterElectoralRollErrorDto>) {
    Object.assign(this, partial);
  }
}

export class BulkRegisterElectoralRollResponseDto {
  @ApiProperty({ example: 'Electoral roll registration completed.' })
  message!: string;

  @ApiProperty({ example: 100 })
  totalRows!: number;

  @ApiProperty({ example: 85 })
  registered!: number;

  @ApiProperty({ example: 5 })
  alreadyRegistered!: number;

  @ApiProperty({ example: 8 })
  notFound!: number;

  @ApiProperty({ example: 2 })
  invalidRows!: number;

  @ApiProperty({ type: [BulkRegisterElectoralRollErrorDto] })
  errors!: BulkRegisterElectoralRollErrorDto[];

  constructor(partial: Partial<BulkRegisterElectoralRollResponseDto>) {
    Object.assign(this, partial);
  }
}
