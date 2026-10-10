import { ApiProperty } from '@nestjs/swagger';

export class ImportElectoralRegistryResponseDto {
  @ApiProperty({ example: 'Electoral registry imported successfully.' })
  message!: string;

  @ApiProperty({ example: 250 })
  processed!: number;

  @ApiProperty({ example: 248 })
  created!: number;

  @ApiProperty({ example: 2 })
  failed!: number;

  constructor(partial: Partial<ImportElectoralRegistryResponseDto>) {
    Object.assign(this, partial);
  }
}
