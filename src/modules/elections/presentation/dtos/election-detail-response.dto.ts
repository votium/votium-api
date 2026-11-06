import { ApiProperty } from '@nestjs/swagger';
import { CandidacyWithCandidateResponseDto } from 'src/modules/candidacies/presentation/dtos/election-candidacies-response.dto';
import { ELECTION_STATUSES, type ElectionStatus } from '../../domain/entities/election.entity';
import { ElectionResponseDto } from './election-response.dto';

export class ElectionStatusHistoryEntryResponseDto {
  @ApiProperty({ example: 'PENDING', enum: ELECTION_STATUSES })
  status!: ElectionStatus;

  @ApiProperty({ example: '2026-08-29T15:00:00.000Z', type: 'string', format: 'date-time' })
  timestamp!: string;

  constructor(partial: Partial<ElectionStatusHistoryEntryResponseDto>) {
    Object.assign(this, partial);
  }
}

export class ElectionDetailResponseDto extends ElectionResponseDto {
  @ApiProperty({ type: [ElectionStatusHistoryEntryResponseDto] })
  statusHistory!: ElectionStatusHistoryEntryResponseDto[];

  @ApiProperty({ type: [CandidacyWithCandidateResponseDto] })
  candidacies!: CandidacyWithCandidateResponseDto[];

  @ApiProperty({ example: 1250 })
  registeredVoters!: number;

  constructor(partial: Partial<ElectionDetailResponseDto>) {
    super(partial);
    Object.assign(this, partial);
  }
}
