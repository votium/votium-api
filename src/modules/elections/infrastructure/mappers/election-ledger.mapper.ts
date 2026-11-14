import { ElectionLedgerDto, CreateElectionLedgerResultDto } from '../../application/dtos';

export class ElectionLedgerMapper {
  static toApplicationResult(response: {
    docType: 'election';
    electionId: string;
    name: string;
    startDate: string;
    endDate: string;
    status: CreateElectionLedgerResultDto['data']['status'];
    signingPublicKey: string;
    createdBy: string;
    updatedBy: string;
    timeline: CreateElectionLedgerResultDto['data']['timeline'];
  }): ElectionLedgerDto {
    return {
      electionId: response.electionId,
      name: response.name,
      startDate: response.startDate,
      endDate: response.endDate,
      status: response.status,
      signingPublicKey: response.signingPublicKey,
      createdBy: response.createdBy,
      updatedBy: response.updatedBy,
      timeline: response.timeline,
    };
  }
}
