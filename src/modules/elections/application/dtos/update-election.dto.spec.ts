import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateElectionDto } from './update-election.dto';

describe('UpdateElectionDto', () => {
  function validate(input: Record<string, unknown>) {
    return validateSync(plainToInstance(UpdateElectionDto, input));
  }

  const complete = {
    name: 'Student Council Election',
    description: 'Annual election for the student council.',
    startDate: '2026-10-01',
    startTime: '08:00:00',
    endDate: '2026-10-01',
    endTime: '18:00:00',
  };

  it('VD-01: accepts a complete payload (all six fields + blankVoteEnabled)', () => {
    expect(validate({ ...complete, blankVoteEnabled: true })).toHaveLength(0);
  });

  it.each(['name', 'description', 'startDate', 'startTime', 'endDate', 'endTime'])(
    'VD-02..07: rejects a payload missing %s',
    (field) => {
      const input = { ...complete };
      delete input[field as keyof typeof complete];
      const errors = validate(input);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe(field);
    },
  );

  it('VD-08: accepts a payload omitting blankVoteEnabled (optional)', () => {
    expect(validate(complete)).toHaveLength(0);
  });

  it('VD-09: rejects a non-boolean blankVoteEnabled', () => {
    const errors = validate({ ...complete, blankVoteEnabled: 'true' });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('blankVoteEnabled');
  });
});
