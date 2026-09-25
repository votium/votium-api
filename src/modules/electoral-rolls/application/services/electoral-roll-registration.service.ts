import { Logger } from '@nestjs/common';
import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import type { ElectorRepository } from 'src/modules/electors/domain/repositories/elector.repository.interface';
import { ElectionNotRegisterableError } from '../../domain/errors/election-not-registerable.error';
import type { ElectoralRollRepository } from '../../domain/repositories/electoral-roll.repository.interface';
import type { BulkRegisterElectoralRollResult } from '../dtos/bulk-register-electoral-roll-result';

export const BULK_REGISTER_ELECTORAL_ROLL_AUDIT_ACTION = 'BULK_REGISTER_ELECTORAL_ROLL';
export const MANUAL_REGISTER_ELECTORAL_ROLL_AUDIT_ACTION = 'MANUAL_REGISTER_ELECTORAL_ROLL';

export interface RegisterElectoralRollPairsInput {
  electionId: string;
  // Ordered input pairs (duplicates allowed). The service deduplicates internally while
  // preserving the original order for accurate row/error reporting.
  rows: Array<{ studentCode: string; programCode: string }>;
  requestingUserId: string;
  // Audit action recorded for the registration (bulk vs manual).
  auditAction: string;
}

/**
 * Shared electoral-roll registration core. Registers one or more EXISTING electors in an
 * election by their (studentCode, programCode) pairs. Never creates electors.
 *
 * No NestJS decorators: registered via useFactory in the module.
 */
export class ElectoralRollRegistrationService {
  private readonly logger = new Logger(ElectoralRollRegistrationService.name);

  constructor(
    private readonly electionRepo: ElectionRepository,
    private readonly electorRepo: ElectorRepository,
    private readonly electoralRollRepo: ElectoralRollRepository,
    private readonly audit: AuditLogPort,
  ) {}

  async registerPairs(
    input: RegisterElectoralRollPairsInput,
  ): Promise<BulkRegisterElectoralRollResult> {
    const { electionId, rows, requestingUserId, auditAction } = input;

    // Empty input early return
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

    // Validate election exists
    const election = await this.electionRepo.findById(electionId);
    if (!election) {
      throw new ElectionNotFoundError(electionId);
    }

    // Validate election accepts electoral-roll loads (CREATED or PENDING).
    // PUBLISHED/ACTIVE/CLOSED are sealed and must never accept a roll.
    if (!election.isRollLoadable()) {
      throw new ElectionNotRegisterableError();
    }

    // Deduplicate input pairs (preserve order for error reporting)
    const uniquePairs = deduplicatePairs(rows);

    // Batch lookup electors
    const foundElectors = await this.electorRepo.findByStudentCodeAndProgramCode(uniquePairs);

    // Build lookup map: "studentCode::programCode" → elector
    const electorMap = new Map<string, { id: string; isActive: boolean }>();
    for (const elector of foundElectors) {
      electorMap.set(`${elector.studentCode}::${elector.programCode}`, {
        id: elector.id!,
        isActive: elector.isActive(),
      });
    }

    // Classify input rows: matched (active) vs not-found vs inactive
    const matchedElectorIds: string[] = [];
    const errors: Array<{ row: number; reason: string }> = [];
    let notFound = 0;
    let invalidRows = 0;

    // Track the 1-based position where each unique pair first appeared in the input
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

    // Check already-registered rolls
    const existingRolls = await this.electoralRollRepo.findByElectionAndElectorIds(
      electionId,
      matchedElectorIds,
    );
    const existingElectorIds = new Set(existingRolls.map((r) => r.electorId));

    const newElectorIds = matchedElectorIds.filter((id) => !existingElectorIds.has(id));
    const alreadyRegistered = matchedElectorIds.length - newElectorIds.length;

    // Bulk insert new rolls
    let registered = 0;
    if (newElectorIds.length > 0) {
      registered = await this.electoralRollRepo.createMany(electionId, newElectorIds);
    }

    // Transition CREATED → PENDING once the roll has been loaded. The domain rule
    // guarantees the transition is legal and idempotent for PENDING; only a CREATED
    // election reaches this branch. A race (election deleted or status changed
    // concurrently) surfaces as null from updateStatus: tolerated and logged, never
    // failing the request (partial-success convention).
    if (registered > 0 && election.currentStatus === 'CREATED') {
      election.markAsPending();
      const updated = await this.electionRepo.updateStatus(electionId, 'PENDING', requestingUserId);
      if (!updated) {
        this.logger.warn(
          `Election ${electionId} could not be transitioned to PENDING (updateStatus returned null).`,
        );
      } else {
        await this.audit.log('ELECTION_STATUS_CHANGED', requestingUserId, {
          electionId,
          newStatus: 'PENDING',
        });
      }
    }

    // Audit log
    await this.audit.log(auditAction, requestingUserId, {
      electionId,
      totalRows: rows.length,
      registered,
      alreadyRegistered,
      notFound,
      invalidRows,
    });

    this.logger.log(
      `Electoral roll registration completed: total=${rows.length} registered=${registered} ` +
        `alreadyRegistered=${alreadyRegistered} notFound=${notFound} invalidRows=${invalidRows}`,
    );

    // Return summary
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
