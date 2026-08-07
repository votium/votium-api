import { ElectorEntity } from '../../domain/entities/elector.entity';

export type PrismaElectorRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  password_hash: string;
  student_code: string;
  program_code: string;
  status: string;
  created_at: Date;
};

export type PrismaElectorCreateData = Omit<PrismaElectorRow, 'id' | 'created_at'>;

export class PrismaElectorMapper {
  static toDomain(row: PrismaElectorRow): ElectorEntity {
    return ElectorEntity.restore({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      passwordHash: row.password_hash,
      studentCode: row.student_code,
      programCode: row.program_code,
      status: row.status,
      createdAt: row.created_at,
    });
  }

  static toPersistence(entity: ElectorEntity): PrismaElectorCreateData {
    return {
      first_name: entity.firstName,
      last_name: entity.lastName,
      email: entity.email,
      password_hash: entity.passwordHash,
      student_code: entity.studentCode,
      program_code: entity.programCode,
      status: entity.status,
    };
  }
}
