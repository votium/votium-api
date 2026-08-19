import { CandidateEntity } from '../../domain/entities/candidate.entity';

export type PrismaCandidateRow = {
  id: string;
  first_name: string;
  last_name: string;
  student_code: string;
  program_code: string;
  identification_number: string;
  status: string;
  created_at: Date;
};

export type PrismaCandidateCreateData = Omit<PrismaCandidateRow, 'id' | 'created_at'>;

export class PrismaCandidateMapper {
  static toDomain(row: PrismaCandidateRow): CandidateEntity {
    return CandidateEntity.restore({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      studentCode: row.student_code,
      programCode: row.program_code,
      identificationNumber: row.identification_number,
      status: row.status,
      createdAt: row.created_at,
    });
  }

  static toPersistence(entity: CandidateEntity): PrismaCandidateCreateData {
    return {
      first_name: entity.firstName,
      last_name: entity.lastName,
      student_code: entity.studentCode,
      program_code: entity.programCode,
      identification_number: entity.identificationNumber,
      status: entity.status,
    };
  }
}
