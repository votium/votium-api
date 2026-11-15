import {
  RegisterCandidateLedgerDto,
  RegisterCandidateLedgerResultDto,
} from '../../application/dtos';
import { RegisterCandidateDto as FabricRegisterCandidateDto } from '../../../../fabric/dto/inputs';

export class CandidateLedgerMapper {
  static toFabricRegisterInput(input: RegisterCandidateLedgerDto): FabricRegisterCandidateDto {
    return {
      electionId: input.electionId,
      candidateId: input.candidateId,
      name: input.name,
    };
  }

  static toApplicationResult(response: {
    txId?: string;
    blockNumber?: number | null;
    data: {
      docType: 'candidate';
      electionId: string;
      candidateId: string;
      name: string;
      registeredBy: string;
      registeredAt: string;
    };
  }): RegisterCandidateLedgerResultDto {
    return {
      txId: response.txId,
      blockNumber: response.blockNumber,
      data: {
        electionId: response.data.electionId,
        candidateId: response.data.candidateId,
        name: response.data.name,
        registeredBy: response.data.registeredBy,
        registeredAt: response.data.registeredAt,
      },
    };
  }
}
