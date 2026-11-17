import { ApiProperty } from '@nestjs/swagger';

export class ScheduledElectionsCountResponseDto {
  @ApiProperty({
    example: 3,
    description:
      'Number of CREATED elections where the elector is registered in the electoral roll.',
  })
  count!: number;

  constructor(partial: Partial<ScheduledElectionsCountResponseDto>) {
    Object.assign(this, partial);
  }
}
