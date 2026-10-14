import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUrl, Min } from 'class-validator';

export class UpdateCandidacyDto {
  @ApiProperty({
    example: 3,
    required: false,
    description: 'Ballot position of the candidacy within the election.',
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  positionNumber?: number;

  @ApiProperty({
    example: 'https://example.com/photo.png',
    required: false,
    nullable: true,
    description: 'Photo URL of the candidate. Pass null to clear the current photo.',
  })
  @IsOptional()
  @IsUrl()
  imageUrl?: string | null;
}
