import type { BulkRegisterElectoralRollResult } from '../../application/dtos/bulk-register-electoral-roll-result';
import type { ElectoralRollSummaryResult } from '../../application/dtos/electoral-roll-summary-result';
import type { ElectorEntity } from 'src/modules/electors/domain/entities/elector.entity';
import { ElectorPresenter } from 'src/modules/electors/presentation/presenters/elector.presenter';
import {
  BulkRegisterElectoralRollResponseDto,
  BulkRegisterElectoralRollErrorDto,
} from '../dtos/bulk-register-electoral-roll-response.dto';
import { ElectoralRollSummaryResponseDto } from '../dtos/electoral-roll-summary-response.dto';

export class ElectoralRollPresenter {
  static toBulkRegisterResponse(
    result: BulkRegisterElectoralRollResult,
  ): BulkRegisterElectoralRollResponseDto {
    return new BulkRegisterElectoralRollResponseDto({
      message: 'Electoral roll registration completed.',
      totalRows: result.totalRows,
      registered: result.registered,
      alreadyRegistered: result.alreadyRegistered,
      notFound: result.notFound,
      invalidRows: result.invalidRows,
      errors: result.errors.map((e) => new BulkRegisterElectoralRollErrorDto(e)),
    });
  }

  static toSummary(result: ElectoralRollSummaryResult): ElectoralRollSummaryResponseDto {
    return new ElectoralRollSummaryResponseDto({
      electionName: result.electionName,
      registeredVoters: result.registeredVoters,
    });
  }

  static toElectorList(electors: ElectorEntity[]) {
    return ElectorPresenter.toList(electors);
  }
}
