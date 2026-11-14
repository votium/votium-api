import { AuditLogPresenter } from './audit-log.presenter';
import type { AuditLogRecord } from '../../domain/repositories/audit-log.repository.interface';

describe('AuditLogPresenter', () => {
  const record: AuditLogRecord = {
    id: 'log-1',
    userId: 'user-1',
    action: 'USER_CREATED',
    reason: 'reason text',
    details: '{"userId":"user-1","a":1}',
    timestamp: new Date('2026-11-10T15:00:00.000Z'),
  };

  it('maps every field and serializes timestamp to ISO', () => {
    const dto = AuditLogPresenter.toResponse(record);

    expect(dto.id).toBe('log-1');
    expect(dto.userId).toBe('user-1');
    expect(dto.action).toBe('USER_CREATED');
    expect(dto.reason).toBe('reason text');
    expect(dto.details).toBe('{"userId":"user-1","a":1}');
    expect(dto.timestamp).toBe('2026-11-10T15:00:00.000Z');
  });

  it('preserves null reason and details', () => {
    const dto = AuditLogPresenter.toResponse({
      ...record,
      reason: null,
      details: null,
    });

    expect(dto.reason).toBeNull();
    expect(dto.details).toBeNull();
  });

  it('returns details verbatim without parsing or re-serializing', () => {
    const ugly = ' { "a" : 1, "a" : 2 , "b":[ 3,4 ] } ';
    const dto = AuditLogPresenter.toResponse({ ...record, details: ugly });

    expect(dto.details).toBe(ugly);
  });

  it('maps a list preserving order', () => {
    const second = { ...record, id: 'log-2' };
    const dtos = AuditLogPresenter.toList([record, second]);

    expect(dtos).toHaveLength(2);
    expect(dtos.map((d) => d.id)).toEqual(['log-1', 'log-2']);
  });

  it('exposes only the documented contract keys', () => {
    const dto = AuditLogPresenter.toResponse(record);

    expect(Object.keys(dto).sort()).toEqual([
      'action',
      'details',
      'id',
      'reason',
      'timestamp',
      'userId',
    ]);
  });
});
