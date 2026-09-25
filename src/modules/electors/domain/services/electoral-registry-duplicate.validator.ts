export interface ElectorDuplicateCandidate {
  studentCode: string;
  email: string;
}

export interface ElectorDuplicateReport {
  hasDuplicates: boolean;
  inFileDuplicates: number;
  existingDuplicates: number;
}

export class ElectoralRegistryDuplicateValidator {
  validate(
    rows: ElectorDuplicateCandidate[],
    existing: ElectorDuplicateCandidate[],
  ): ElectorDuplicateReport {
    const inFileDuplicates = this.countInFileDuplicates(rows);
    const existingDuplicates = this.countExistingDuplicates(rows, existing);

    return {
      hasDuplicates: inFileDuplicates > 0 || existingDuplicates > 0,
      inFileDuplicates,
      existingDuplicates,
    };
  }

  private countInFileDuplicates(rows: ElectorDuplicateCandidate[]): number {
    const seenStudentCodes = new Set<string>();
    const seenEmails = new Set<string>();
    let duplicates = 0;

    for (const row of rows) {
      const repeatsStudentCode = seenStudentCodes.has(row.studentCode);
      const repeatsEmail = seenEmails.has(row.email);

      seenStudentCodes.add(row.studentCode);
      seenEmails.add(row.email);

      if (repeatsStudentCode || repeatsEmail) duplicates++;
    }

    return duplicates;
  }

  private countExistingDuplicates(
    rows: ElectorDuplicateCandidate[],
    existing: ElectorDuplicateCandidate[],
  ): number {
    if (existing.length === 0) return 0;

    const existingStudentCodes = new Set(existing.map((record) => record.studentCode));
    const existingEmails = new Set(existing.map((record) => record.email));

    return rows.filter(
      (row) => existingStudentCodes.has(row.studentCode) || existingEmails.has(row.email),
    ).length;
  }
}
