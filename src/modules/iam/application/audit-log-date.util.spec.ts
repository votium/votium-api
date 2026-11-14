import { BadRequestException } from 'src/shared/exceptions/base/bad-request.exception';
import { parseAuditLogDate } from './audit-log-date.util';

describe('parseAuditLogDate', () => {
  it('returns inclusive UTC start/end of day for a valid date', () => {
    const result = parseAuditLogDate('2026-11-10');

    expect(result.startOfDay).toEqual(new Date('2026-11-10T00:00:00.000Z'));
    expect(result.endOfDay).toEqual(new Date('2026-11-10T23:59:59.999Z'));
  });

  it('rejects an impossible date', () => {
    expect(() => parseAuditLogDate('2026-02-30')).toThrow(BadRequestException);
    let thrown: BadRequestException | undefined;
    try {
      parseAuditLogDate('2026-02-30');
    } catch (error) {
      thrown = error as BadRequestException;
    }
    expect(thrown?.code).toBe('AUDIT_LOG_INVALID_DATE');
  });

  it('rejects an invalid month', () => {
    expect(() => parseAuditLogDate('2026-13-01')).toThrow(BadRequestException);
  });

  it('rejects a datetime string', () => {
    expect(() => parseAuditLogDate('2026-11-10T15:00:00Z')).toThrow(BadRequestException);
  });

  it('accepts leap-day only in leap years', () => {
    expect(parseAuditLogDate('2024-02-29').startOfDay).toEqual(
      new Date('2024-02-29T00:00:00.000Z'),
    );
    expect(() => parseAuditLogDate('2023-02-29')).toThrow(BadRequestException);
  });
});
