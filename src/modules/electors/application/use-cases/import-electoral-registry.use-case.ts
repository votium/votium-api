import { Inject, Injectable, Logger } from '@nestjs/common';
import { BadRequestException } from 'src/shared/exceptions/base/bad-request.exception';
import { InternalServerErrorException } from 'src/shared/exceptions/base/internal-server-error.exception';
import {
  PASSWORD_HASHER_PORT,
  type PasswordHasherPort,
} from 'src/modules/iam/application/ports/password-hasher.port';
import { ElectorDuplicateError } from '../../domain/errors/elector-duplicate.error';
import { ElectorEntity } from '../../domain/entities/elector.entity';
import {
  ELECTOR_REPOSITORY,
  type ElectorRepository,
} from '../../domain/repositories/elector.repository.interface';
import { CSV_PARSER_PORT, type CsvParserPort, type ElectorCsvRow } from '../ports/csv-parser.port';

export interface ElectoralRegistryImportSummary {
  processed: number;
  created: number;
  failed: number;
}

@Injectable()
export class ImportElectoralRegistryUseCase {
  private readonly logger = new Logger(ImportElectoralRegistryUseCase.name);

  constructor(
    @Inject(CSV_PARSER_PORT) private readonly parser: CsvParserPort,
    @Inject(ELECTOR_REPOSITORY) private readonly electors: ElectorRepository,
    @Inject(PASSWORD_HASHER_PORT) private readonly hasher: PasswordHasherPort,
  ) {}

  async execute(input: {
    originalName: string;
    buffer: Buffer;
  }): Promise<ElectoralRegistryImportSummary> {
    if (!isCsvFileName(input.originalName)) {
      throw new BadRequestException('Only CSV files are supported.');
    }

    let rows: ElectorCsvRow[];
    try {
      rows = this.parser.parse(input.buffer);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;

      this.logger.error('Unexpected error while parsing the electoral registry file.', error);
      throw new InternalServerErrorException(
        'Unexpected error while importing electoral registry.',
      );
    }

    this.logger.log(`Electoral registry import started: ${rows.length} rows to process.`);

    let created = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        const password = ElectorEntity.buildTemporaryPassword(
          row.firstName,
          row.lastName,
          row.studentCode,
        );
        const passwordHash = await this.hasher.hash(password);

        const entity = ElectorEntity.create({ ...row, passwordHash });
        await this.electors.create(entity);
        created++;
      } catch (error) {
        if (error instanceof ElectorDuplicateError) {
          this.logger.warn(
            `Electoral registry import: duplicate elector skipped (studentCode=${row.studentCode}).`,
          );
        } else {
          this.logger.error(
            `Electoral registry import: unexpected error for row (studentCode=${row.studentCode}).`,
            error,
          );
        }
        failed++;
      }
    }

    this.logger.log(
      `Electoral registry import completed: processed=${rows.length} created=${created} failed=${failed}.`,
    );

    return { processed: rows.length, created, failed };
  }
}

function isCsvFileName(originalName: string): boolean {
  return originalName.toLowerCase().endsWith('.csv');
}
