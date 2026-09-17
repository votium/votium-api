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
  companion_first_name: string | null;
  companion_last_name: string | null;
  companion_student_code: string | null;
  companion_program_code: string | null;
  companion_identification: string | null;
  created_at: Date;
  deleted_at: Date | null;
};

export type PrismaCandidateCreateData = Omit<
  PrismaCandidateRow,
  'id' | 'created_at' | 'deleted_at'
>;

export type PrismaCandidateUpdateData = Partial<
  Pick<
    PrismaCandidateRow,
    | 'first_name'
    | 'last_name'
    | 'program_code'
    | 'identification_number'
    | 'companion_first_name'
    | 'companion_last_name'
    | 'companion_student_code'
    | 'companion_program_code'
    | 'companion_identification'
  >
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
      deletedAt: row.deleted_at,
      companionFirstName: row.companion_first_name,
      companionLastName: row.companion_last_name,
      companionStudentCode: row.companion_student_code,
      companionProgramCode: row.companion_program_code,
      companionIdentification: row.companion_identification,
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
      companion_first_name: entity.companionFirstName,
      companion_last_name: entity.companionLastName,
      companion_student_code: entity.companionStudentCode,
      companion_program_code: entity.companionProgramCode,
      companion_identification: entity.companionIdentification,
    };
  }

  static toUpdateData(input: UpdateCandidateInput): PrismaCandidateUpdateData {
    const data: PrismaCandidateUpdateData = {};
    if (input.firstName != null) data.first_name = input.firstName;
    if (input.lastName != null) data.last_name = input.lastName;
    if (input.programCode != null) data.program_code = input.programCode;
    if (input.identificationNumber != null) {
      data.identification_number = input.identificationNumber;
    }
    if (input.companionFirstName != null) {
      data.companion_first_name = input.companionFirstName;
    }
    if (input.companionLastName != null) {
      data.companion_last_name = input.companionLastName;
    }
    if (input.companionStudentCode != null) {
      data.companion_student_code = input.companionStudentCode;
    }
    if (input.companionProgramCode != null) {
      data.companion_program_code = input.companionProgramCode;
    }
    if (input.companionIdentification != null) {
      data.companion_identification = input.companionIdentification;
    }
    return data;
  }
}
