import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CheckElectorHasVotedDto } from './check-elector-has-voted.dto';

async function errorsFor(payload: Record<string, unknown>) {
  return validate(plainToInstance(CheckElectorHasVotedDto, payload));
}

describe('CheckElectorHasVotedDto', () => {
  it('accepts a valid UUID electionId', async () => {
    expect(await errorsFor({ electionId: '22222222-2222-4222-8222-222222222222' })).toHaveLength(0);
  });

  it('rejects a missing electionId', async () => {
    expect(await errorsFor({})).not.toHaveLength(0);
  });

  it('rejects a non-UUID electionId', async () => {
    expect(await errorsFor({ electionId: 'not-a-uuid' })).not.toHaveLength(0);
  });
});
