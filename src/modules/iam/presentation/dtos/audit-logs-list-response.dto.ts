import { ApiProperty } from '@nestjs/swagger';
import { PaginatedMetaDto } from 'src/shared/pagination/paginated-meta.dto';
import { AuditLogResponseDto } from './audit-log-response.dto';

export class AuditLogsListResponseDto {
  @ApiProperty({ type: AuditLogResponseDto, isArray: true })
  data!: AuditLogResponseDto[];

  @ApiProperty({ type: PaginatedMetaDto })
  meta!: PaginatedMetaDto;
}
