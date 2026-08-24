import { CandidateEntity } from '../../domain/entities/candidate.entity';
import type { UpdateCandidateInput } from '../../domain/entities/update-candidate-input';

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

export type PrismaCandidateUpdateData = Partial<
  Pick<PrismaCandidateRow, 'first_name' | 'last_name' | 'program_code' | 'identification_number'>
>;

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

  static toUpdateData(input: UpdateCandidateInput): PrismaCandidateUpdateData {
    const data: PrismaCandidateUpdateData = {};
    if (input.firstName !== undefined) data.first_name = input.firstName;
    if (input.lastName !== undefined) data.last_name = input.lastName;
    if (input.programCode !== undefined) data.program_code = input.programCode;
    if (input.identificationNumber !== undefined) {
      data.identification_number = input.identificationNumber;
    }
    return data;
  }
}
