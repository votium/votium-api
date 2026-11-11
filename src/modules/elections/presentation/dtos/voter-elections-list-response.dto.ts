import { ApiProperty } from '@nestjs/swagger';
import { PaginatedMetaDto } from 'src/shared/pagination/paginated-meta.dto';
import { VoterElectionDetailResponseDto } from './voter-election-detail-response.dto';

export class VoterElectionsListResponseDto {
  @ApiProperty({ type: VoterElectionDetailResponseDto, isArray: true })
  data!: VoterElectionDetailResponseDto[];

  @ApiProperty({ type: PaginatedMetaDto })
  meta!: PaginatedMetaDto;
}
