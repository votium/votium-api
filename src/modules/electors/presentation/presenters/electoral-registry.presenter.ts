import type { ElectoralRegistryImportSummary } from '../../application/use-cases/import-electoral-registry.use-case';
import { ImportElectoralRegistryResponseDto } from '../dtos/import-electoral-registry-response.dto';

export class ElectoralRegistryPresenter {
  static toImportResponse(
    summary: ElectoralRegistryImportSummary,
  ): ImportElectoralRegistryResponseDto {
    return new ImportElectoralRegistryResponseDto({
      message: 'Electoral registry imported successfully.',
      processed: summary.processed,
      created: summary.created,
      failed: summary.failed,
    });
  }
}
