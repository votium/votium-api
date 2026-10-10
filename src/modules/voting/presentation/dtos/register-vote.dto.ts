import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RegisterVoteDto {
  @ApiProperty({
    example: '3f1c8d2e-1b2c-4d3e-9f0a-1b2c3d4e5f6a',
    description: 'Candidacy UUID belonging to the election, or "blank" for a blank vote.',
  })
  @IsString()
  @IsNotEmpty()
  candidacyId!: string;
}
