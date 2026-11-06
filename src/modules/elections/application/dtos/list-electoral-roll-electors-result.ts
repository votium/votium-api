import type { ElectorEntity } from 'src/modules/electors/domain/entities/elector.entity';

export interface ListElectoralRollElectorsResult {
  electors: ElectorEntity[];
  total: number;
}
