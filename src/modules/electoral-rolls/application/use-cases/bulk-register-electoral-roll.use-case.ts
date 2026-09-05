import { Logger } from '@nestjs/common';
import { BadRequestException } from 'src/shared/exceptions/base/bad-request.exception';
import { InternalServerErrorException } from 'src/shared/exceptions/base/internal-server-error.exception';
import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import { ElectionNotRegisterableError } from '../../domain/errors/election-not-registerable.error';
import type { ElectoralRollCsvParserPort } from '../ports/electoral-roll-csv-parser.port';
import type { ElectoralRollRepository } from '../../domain/repositories/electoral-roll.repository.interface';
import type { ElectorRepository } from 'src/modules/electors/domain/repositories/elector.repository.interface';
import type { BulkRegisterElectoralRollResult } from '../dtos/bulk-register-electoral-roll-result';

export class BulkRegisterElectoralRollUseCase {
  private readonly logger = new Logger(BulkRegisterElectoralRollUseCase.name);

  constructor(
    private readonly parser: ElectoralRollCsvParserPort,
    private readonly electionRepo: ElectionRepository,
    private readonly electorRepo: ElectorRepository,
    private readonly electoralRollRepo: ElectoralRollRepository,
    private readonly audit: AuditLogPort,
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

    // 3. Empty CSV early return
    if (rows.length === 0) {
      return {
        totalRows: 0,
        registered: 0,
        alreadyRegistered: 0,
        notFound: 0,
        invalidRows: 0,
        errors: [],
      };
    }

    // 4. Validate election exists
    const election = await this.electionRepo.findById(input.electionId);
    if (!election) {
      throw new ElectionNotFoundError(input.electionId);
    }

    // 5. Validate election accepts electoral-roll loads (CREATED or PENDING).
    //    PUBLISHED/ACTIVE/CLOSED are sealed and must never accept a roll.
    if (!election.isRollLoadable()) {
      throw new ElectionNotRegisterableError();
    }

    // 6. Deduplicate input pairs (preserve order for error reporting)
    const uniquePairs = deduplicatePairs(rows);

    // 7. Batch lookup electors
    const foundElectors = await this.electorRepo.findByStudentCodeAndProgramCode(uniquePairs);

    // Build lookup map: "studentCode::programCode" → elector
    const electorMap = new Map<string, { id: string; isActive: boolean }>();
    for (const elector of foundElectors) {
      electorMap.set(`${elector.studentCode}::${elector.programCode}`, {
        id: elector.id!,
        isActive: elector.isActive(),
      });
    }

    // 8. Classify CSV rows: matched (active) vs not-found
    const matchedElectorIds: string[] = [];
    const errors: Array<{ row: number; reason: string }> = [];
    let notFound = 0;
    let invalidRows = 0;

    // Track which row number each unique pair first appeared on (1-indexed in CSV)
    const firstOccurrenceRow = new Map<string, number>();
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const key = `${row.studentCode}::${row.programCode}`;
      if (!firstOccurrenceRow.has(key)) {
        firstOccurrenceRow.set(key, index + 1);
      }
    }

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const key = `${row.studentCode}::${row.programCode}`;
      const elector = electorMap.get(key);

      if (!elector) {
        // Only count/report on first occurrence of this unique pair
        if (firstOccurrenceRow.get(key) === index + 1) {
          notFound++;
          errors.push({
            row: index + 1,
            reason: 'Elector not found for the provided student code and program code.',
          });
        }
        continue;
      }

      if (!elector.isActive) {
        if (firstOccurrenceRow.get(key) === index + 1) {
          invalidRows++;
          errors.push({
            row: index + 1,
            reason: 'Elector is not active.',
          });
        }
        continue;
      }

      // First occurrence only for matched pairs
      if (firstOccurrenceRow.get(key) === index + 1) {
        matchedElectorIds.push(elector.id);
      }
    }

    // 9. Check already-registered rolls
    const existingRolls = await this.electoralRollRepo.findByElectionAndElectorIds(
      input.electionId,
      matchedElectorIds,
    );
    const existingElectorIds = new Set(existingRolls.map((r) => r.electorId));

    const newElectorIds = matchedElectorIds.filter((id) => !existingElectorIds.has(id));
    const alreadyRegistered = matchedElectorIds.length - newElectorIds.length;

    // 10. Bulk insert new rolls
    let registered = 0;
    if (newElectorIds.length > 0) {
      registered = await this.electoralRollRepo.createMany(input.electionId, newElectorIds);
    }

    // 10.5 Transition CREATED → PENDING once the roll has been loaded. The domain rule
    // guarantees the transition is legal and idempotent for PENDING; only a CREATED
    // election reaches this branch. A race (election deleted or status changed
    // concurrently) surfaces as null from updateStatus: tolerated and logged, never
    // failing the request (partial-success convention).
    if (registered > 0 && election.currentStatus === 'CREATED') {
      election.markAsPending();
      const updated = await this.electionRepo.updateStatus(
        input.electionId,
        'PENDING',
        input.requestingUserId,
      );
      if (!updated) {
        this.logger.warn(
          `Election ${input.electionId} could not be transitioned to PENDING (updateStatus returned null).`,
        );
      } else {
        await this.audit.log('ELECTION_STATUS_CHANGED', input.requestingUserId, {
          electionId: input.electionId,
          newStatus: 'PENDING',
        });
      }
    }

    // 11. Audit log
    await this.audit.log('BULK_REGISTER_ELECTORAL_ROLL', input.requestingUserId, {
      electionId: input.electionId,
      totalRows: rows.length,
      registered,
      alreadyRegistered,
      notFound,
      invalidRows,
    });

    this.logger.log(
      `Bulk register electoral roll completed: total=${rows.length} registered=${registered} ` +
        `alreadyRegistered=${alreadyRegistered} notFound=${notFound} invalidRows=${invalidRows}`,
    );

    // 12. Return summary
    return {
      totalRows: rows.length,
      registered,
      alreadyRegistered,
      notFound,
      invalidRows,
      errors,
    };
  }
}

function isCsvFileName(originalName: string): boolean {
  return originalName.toLowerCase().endsWith('.csv');
}

function deduplicatePairs(
  rows: Array<{ studentCode: string; programCode: string }>,
): Array<{ studentCode: string; programCode: string }> {
  const seen = new Set<string>();
  const result: Array<{ studentCode: string; programCode: string }> = [];

  for (const row of rows) {
    const key = `${row.studentCode}::${row.programCode}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(row);
    }
  }

  return result;
}
