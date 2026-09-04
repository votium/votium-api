export interface BulkRegisterElectoralRollError {
  row: number;
  reason: string;
}

export interface BulkRegisterElectoralRollResult {
  totalRows: number;
  registered: number;
  alreadyRegistered: number;
  notFound: number;
  invalidRows: number;
  errors: BulkRegisterElectoralRollError[];
}
