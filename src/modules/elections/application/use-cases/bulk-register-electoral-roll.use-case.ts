import { Logger } from '@nestjs/common';
import { BadRequestException } from 'src/shared/exceptions/base/bad-request.exception';
import { InternalServerErrorException } from 'src/shared/exceptions/base/internal-server-error.exception';
import type { BulkRegisterElectoralRollResult } from '../dtos/bulk-register-electoral-roll-result';
import type { ElectoralRollCsvParserPort } from '../ports/electoral-roll-csv-parser.port';
import {
  BULK_REGISTER_ELECTORAL_ROLL_AUDIT_ACTION,
  ElectoralRollRegistrationService,
} from '../services/electoral-roll-registration.service';

export class BulkRegisterElectoralRollUseCase {
  private readonly logger = new Logger(BulkRegisterElectoralRollUseCase.name);

  constructor(
    private readonly parser: ElectoralRollCsvParserPort,
    private readonly registration: ElectoralRollRegistrationService,
  ) {}

  async execute(input: {
    electionId: string;
    originalName: string;
    buffer: Buffer;
    requestingUserId: string;
  }): Promise<BulkRegisterElectoralRollResult> {
    // 1. Validate CSV file extension
    if (!isCsvFileName(input.originalName)) {
      throw new BadRequestException('Only CSV files are supported.');
    }

    // 2. Parse CSV
    let rows: Array<{ studentCode: string; programCode: string }>;
    try {
      rows = this.parser.parse(input.buffer);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;

      this.logger.error('Unexpected error while parsing the electoral roll file.', error);
      throw new InternalServerErrorException('Unexpected error while importing electoral roll.');
    }

    // 3. Delegate the shared registration orchestration (election validation, elector
    //    resolution, duplicate prevention, status transition, audit, summary).
    return this.registration.registerPairs({
      electionId: input.electionId,
      rows,
      requestingUserId: input.requestingUserId,
      auditAction: BULK_REGISTER_ELECTORAL_ROLL_AUDIT_ACTION,
    });
  }
}

function isCsvFileName(originalName: string): boolean {
  return originalName.toLowerCase().endsWith('.csv');
}
