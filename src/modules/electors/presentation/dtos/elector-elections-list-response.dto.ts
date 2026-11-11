import { ApiProperty } from '@nestjs/swagger';
import { PaginatedMetaDto } from 'src/shared/pagination/paginated-meta.dto';
import { ElectorElectionDetailResponseDto } from './elector-election-detail-response.dto';

export class ElectorElectionsListResponseDto {
  @ApiProperty({ type: ElectorElectionDetailResponseDto, isArray: true })
  data!: ElectorElectionDetailResponseDto[];

  @ApiProperty({ type: PaginatedMetaDto })
  meta!: PaginatedMetaDto;
}
