import { ApiProperty } from '@nestjs/swagger';
import { PaginatedMetaDto } from 'src/shared/pagination/paginated-meta.dto';
import { CandidateResponseDto } from './candidate-response.dto';

export class CandidatesListResponseDto {
  @ApiProperty({ type: CandidateResponseDto, isArray: true })
  data!: CandidateResponseDto[];

  @ApiProperty({ type: PaginatedMetaDto })
  meta!: PaginatedMetaDto;
}
