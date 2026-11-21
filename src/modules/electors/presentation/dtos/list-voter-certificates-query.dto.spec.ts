import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListVoterCertificatesQueryDto } from './list-voter-certificates-query.dto';

const build = (query: Record<string, unknown>) =>
  plainToInstance(ListVoterCertificatesQueryDto, query);

describe('ListVoterCertificatesQueryDto', () => {
  it('defaults page to 1 and limit to 10', async () => {
    const dto = build({});

    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(10);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts positive integers sent as strings', async () => {
    const dto = build({ page: '2', limit: '5' });

    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(5);
    expect(await validate(dto)).toHaveLength(0);
  });

  it.each(['0', '-1', 'abc', '1.5'])('rejects page=%s', async (value) => {
    expect(await validate(build({ page: value }))).not.toHaveLength(0);
  });

  it.each(['0', '-1', 'abc', '1.5', '101'])('rejects limit=%s', async (value) => {
    expect(await validate(build({ limit: value }))).not.toHaveLength(0);
  });
});
