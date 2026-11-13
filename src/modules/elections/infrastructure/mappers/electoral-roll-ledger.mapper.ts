import {
  RegisterElectoralRollLedgerResultDto,
  RegisterElectoralRollLedgerDto,
} from '../../application/dtos';
import { VoterBatchDto as FabricRegisterElectoralRollDto } from '../../../../fabric/dto/inputs';

export class ElectoralRollLedgerMapper {
  static toFabricRegisterInput(
    input: RegisterElectoralRollLedgerDto,
  ): FabricRegisterElectoralRollDto {
    return {
      electionId: input.electionId,
      voterHashes: input.voterHashes,
    };
  }

  static toApplicationResult(response: {
    txId?: string;
    blockNumber?: number | null;
    data: {
      received: number;
      inserted: number;
      skipped: number;
    };
  }): RegisterElectoralRollLedgerResultDto {
    return {
      txId: response.txId,
      blockNumber: response.blockNumber,
      data: {
        received: response.data.received,
        inserted: response.data.inserted,
        skipped: response.data.skipped,
      },
    };
  }
}
