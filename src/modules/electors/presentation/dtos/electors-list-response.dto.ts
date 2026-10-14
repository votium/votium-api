import { ApiProperty } from '@nestjs/swagger';
import { ElectorResponseDto } from './elector-response.dto';
import { PaginatedMetaDto } from 'src/shared/pagination/paginated-meta.dto';

export class ElectorsListResponseDto {
  @ApiProperty({ type: ElectorResponseDto, isArray: true })
  data!: ElectorResponseDto[];

  @ApiProperty({ type: PaginatedMetaDto })
  meta!: PaginatedMetaDto;
}
