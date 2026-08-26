import { BadRequestException } from 'src/shared/exceptions/base/bad-request.exception';

// Shared election date/time parsing + validation helpers.
//
// The Election model stores the calendar date and the time-of-day as separate columns
// (start_date/start_time, ...). These helpers turn the HTTP string representations into
// Date values the domain entity understands, while rejecting malformed or impossible
// values. All errors use the project's domain BadRequestException with a stable `code`
// that the GlobalExceptionFilter maps to the correct HTTP status.

export function parseElectionDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));

  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    throw new BadRequestException(`Invalid calendar date: ${dateStr}`, 'ELECTION_INVALID_DATE');
  }

  return date;
}

export function parseElectionTime(timeStr: string): Date {
  const [hhRaw, mmRaw, ssRaw] = timeStr.split(':');
  const hh = Number(hhRaw);
  const mm = Number(mmRaw);
  const ss = ssRaw !== undefined ? Number(ssRaw) : 0;

  const time = new Date(Date.UTC(1970, 0, 1, hh, mm, ss));

  if (time.getUTCHours() !== hh || time.getUTCMinutes() !== mm || time.getUTCSeconds() !== ss) {
    throw new BadRequestException(`Invalid time: ${timeStr}`, 'ELECTION_INVALID_TIME');
  }

  return time;
}

// Combines the date part (UTC midnight) and the time part (epoch) of a start/end pair
// into a single comparable instant.
function toInstant(date: Date, time: Date): number {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      time.getUTCHours(),
      time.getUTCMinutes(),
      time.getUTCSeconds(),
    ),
  ).getTime();
}

export function assertElectionInterval(
  startDate: Date,
  startTime: Date,
  endDate: Date,
  endTime: Date,
): void {
  if (toInstant(startDate, startTime) >= toInstant(endDate, endTime)) {
    throw new BadRequestException(
      'Election end must be strictly after start.',
      'ELECTION_INVALID_DATE_RANGE',
    );
  }
}
