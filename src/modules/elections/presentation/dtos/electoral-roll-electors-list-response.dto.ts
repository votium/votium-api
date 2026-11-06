import { ApiProperty } from '@nestjs/swagger';
import { ElectorResponseDto } from 'src/modules/electors/presentation/dtos/elector-response.dto';
import { PaginatedMetaDto } from 'src/shared/pagination/paginated-meta.dto';

export class ElectoralRollElectorsListResponseDto {
  @ApiProperty({ type: ElectorResponseDto, isArray: true })
  data!: ElectorResponseDto[];

  @ApiProperty({ type: PaginatedMetaDto })
  meta!: PaginatedMetaDto;
}
