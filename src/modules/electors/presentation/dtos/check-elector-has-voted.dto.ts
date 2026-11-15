import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class CheckElectorHasVotedDto {
  @ApiProperty({
    example: '22222222-2222-4222-8222-222222222222',
    description: 'Unique identifier of the election.',
  })
  @IsNotEmpty()
  @IsUUID()
  electionId!: string;
}
