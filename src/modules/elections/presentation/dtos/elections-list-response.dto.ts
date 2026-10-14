import { ApiProperty } from '@nestjs/swagger';
import { PaginatedMetaDto } from 'src/shared/pagination/paginated-meta.dto';
import { ElectionResponseDto } from './election-response.dto';

export class ElectionsListResponseDto {
  @ApiProperty({ type: ElectionResponseDto, isArray: true })
  data!: ElectionResponseDto[];

  @ApiProperty({ type: PaginatedMetaDto })
  meta!: PaginatedMetaDto;
}
