import { PrismaCandidateMapper } from '../../src/modules/candidates/infrastructure/mappers/prisma-candidate.mapper';

describe('PrismaCandidateMapper.toUpdateData', () => {
  it('M-01: maps all provided fields to snake_case', () => {
    const data = PrismaCandidateMapper.toUpdateData({
      firstName: 'Maria',
      lastName: 'Lopez',
      programCode: '2710',
      identificationNumber: '2000000000',
    });

    expect(data).toEqual({
      first_name: 'Maria',
      last_name: 'Lopez',
      program_code: '2710',
      identification_number: '2000000000',
    });
  });

  it('M-02: maps only firstName when partial', () => {
    const data = PrismaCandidateMapper.toUpdateData({ firstName: 'New' });

    expect(data).toEqual({ first_name: 'New' });
  });

  it('M-03: maps only identificationNumber when partial', () => {
    const data = PrismaCandidateMapper.toUpdateData({ identificationNumber: 'NEW123' });

    expect(data).toEqual({ identification_number: 'NEW123' });
  });

  it('M-04: returns an empty object when input is empty', () => {
    const data = PrismaCandidateMapper.toUpdateData({});

    expect(data).toEqual({});
  });

  it('M-05: excludes undefined values from the payload', () => {
    const data = PrismaCandidateMapper.toUpdateData({
      firstName: undefined,
      lastName: 'Test',
    });

    expect(data).toEqual({ last_name: 'Test' });
  });
});
