import { ApiProperty } from '@nestjs/swagger';
import { PaginatedMetaDto } from 'src/shared/pagination/paginated-meta.dto';
import { CandidacyWithCandidateResponseDto } from './election-candidacies-response.dto';

export class ElectionCandidaciesListResponseDto {
  @ApiProperty({ type: CandidacyWithCandidateResponseDto, isArray: true })
  data!: CandidacyWithCandidateResponseDto[];

  @ApiProperty({ type: PaginatedMetaDto })
  meta!: PaginatedMetaDto;
}
