import { CreateElectionLedgerDto, CreateElectionLedgerResultDto } from '../../application/dtos';
import { CreateElectionDto as FabricCreateElectionDto } from '../../../../fabric/dto/inputs';

export class CreateElectionLedgerMapper {
  private static combineDateAndTime(date: Date, time: Date): string {
    const result = new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        time.getUTCHours(),
        time.getUTCMinutes(),
        time.getUTCSeconds(),
        time.getUTCMilliseconds(),
      ),
    );

    return result.toISOString();
  }

  static toFabricCreateInput(input: CreateElectionLedgerDto): FabricCreateElectionDto {
    return {
      electionId: input.electionId,
      name: input.name,
      ...this.toLedgerDates({
        startDate: input.startDate,
        startTime: input.startTime,
        endDate: input.endDate,
        endTime: input.endTime,
      }),
      signingPublicKey: input.signingPublicKey,
    };
  }

  static toApplicationResult(response: {
    txId?: string;
    blockNumber?: number | null;
    data: {
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
    };
  }): CreateElectionLedgerResultDto {
    return {
      txId: response.txId,
      blockNumber: response.blockNumber,
      data: response.data,
    };
  }

  static toLedgerDates(input: { startDate: Date; startTime: Date; endDate: Date; endTime: Date }): {
    startDate: string;
    endDate: string;
  } {
    return {
      startDate: this.combineDateAndTime(input.startDate, input.startTime),
      endDate: this.combineDateAndTime(input.endDate, input.endTime),
    };
  }
}
