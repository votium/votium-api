import type { BulkRegisterElectoralRollResult } from '../dtos/bulk-register-electoral-roll-result';
import {
  ElectoralRollRegistrationService,
  MANUAL_REGISTER_ELECTORAL_ROLL_AUDIT_ACTION,
} from '../services/electoral-roll-registration.service';

export class ManualRegisterElectoralRollUseCase {
  constructor(private readonly registration: ElectoralRollRegistrationService) {}

  async execute(input: {
    electionId: string;
    electors: Array<{ studentCode: string; programCode: string }>;
    requestingUserId: string;
  }): Promise<BulkRegisterElectoralRollResult> {
    return this.registration.registerPairs({
      electionId: input.electionId,
      rows: input.electors,
      requestingUserId: input.requestingUserId,
      auditAction: MANUAL_REGISTER_ELECTORAL_ROLL_AUDIT_ACTION,
    });
  }
}
