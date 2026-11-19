import { ApiProperty } from '@nestjs/swagger';
import { PaginatedMetaDto } from 'src/shared/pagination/paginated-meta.dto';
import { VoterCertificateListItemResponseDto } from './voter-certificate-list-item-response.dto';

export class VoterCertificatesListResponseDto {
  @ApiProperty({ type: VoterCertificateListItemResponseDto, isArray: true })
  data!: VoterCertificateListItemResponseDto[];

  @ApiProperty({ type: PaginatedMetaDto })
  meta!: PaginatedMetaDto;
}
