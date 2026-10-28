import { ValidationException } from 'src/shared/exceptions/base/validation.exception';

const PERIOD_PATTERN = /^(?:0[1-9]|1[0-2])\d{4}$/;
const CODE_PATTERN = /^ELECTION-((?:0[1-9]|1[0-2])\d{4})-(\d{4})$/;

const MIN_SEQUENCE = 1;
const MAX_SEQUENCE = 9999;

// Validated, immutable election code: ELECTION-MMYYYY-XXXX.
// MMYYYY is the UTC creation period and XXXX is a per-period sequence (0001..9999).
export class ElectionCodeVO {
  private constructor(public readonly value: string) {}

  static periodFor(now: Date): string {
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const year = String(now.getUTCFullYear());
    return `${month}${year}`;
  }

  static generate(period: string, sequence: number): ElectionCodeVO {
    if (!PERIOD_PATTERN.test(period)) {
      throw new ValidationException(`Invalid election code period: ${period}.`);
    }
    if (!Number.isInteger(sequence) || sequence < MIN_SEQUENCE || sequence > MAX_SEQUENCE) {
      throw new ValidationException(
        `Election code sequence must be an integer between ${MIN_SEQUENCE} and ${MAX_SEQUENCE}.`,
      );
    }

    const suffix = String(sequence).padStart(4, '0');
    return new ElectionCodeVO(`ELECTION-${period}-${suffix}`);
  }

  static from(value: string): ElectionCodeVO {
    const match = CODE_PATTERN.exec(value);
    if (!match) {
      throw new ValidationException(`Invalid election code: ${value}.`);
    }

    const sequence = Number(match[2]);
    if (sequence < MIN_SEQUENCE || sequence > MAX_SEQUENCE) {
      throw new ValidationException(`Invalid election code: ${value}.`);
    }

    return new ElectionCodeVO(value);
  }
}
