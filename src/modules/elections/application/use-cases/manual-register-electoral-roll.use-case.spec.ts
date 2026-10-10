import { MANUAL_REGISTER_ELECTORAL_ROLL_AUDIT_ACTION } from '../services/electoral-roll-registration.service';
import { ManualRegisterElectoralRollUseCase } from './manual-register-electoral-roll.use-case';

function makeRegistration(): { registerPairs: jest.Mock } {
  return { registerPairs: jest.fn() };
}

const baseInput = {
  electionId: 'election-uuid',
  electors: [{ studentCode: '202012345', programCode: '2710' }],
  requestingUserId: 'user-uuid',
};

describe('ManualRegisterElectoralRollUseCase', () => {
  it('MU1: delegates the elector, election, requesting user, and MANUAL audit action to the registration service', async () => {
    const registration = makeRegistration();
    const useCase = new ManualRegisterElectoralRollUseCase(registration as never);

    await useCase.execute(baseInput);

    expect(registration.registerPairs).toHaveBeenCalledTimes(1);

    expect(registration.registerPairs).toHaveBeenCalledWith({
      electionId: 'election-uuid',
      rows: baseInput.electors,
      requestingUserId: 'user-uuid',
      auditAction: MANUAL_REGISTER_ELECTORAL_ROLL_AUDIT_ACTION,
    });
  });

  it('MU2: returns the registration service result as-is', async () => {
    const result = {
      totalRows: 1,
      registered: 1,
      alreadyRegistered: 0,
      notFound: 0,
      invalidRows: 0,
      errors: [],
    };
    const registration = makeRegistration();
    registration.registerPairs.mockResolvedValue(result);
    const useCase = new ManualRegisterElectoralRollUseCase(registration as never);

    const actual = await useCase.execute(baseInput);

    expect(actual).toEqual(result);
  });

  it('MU3: propagates election validation errors raised by the registration service', async () => {
    const registration = makeRegistration();
    registration.registerPairs.mockRejectedValue(new Error('ELECTION_NOT_FOUND'));
    const useCase = new ManualRegisterElectoralRollUseCase(registration as never);

    await expect(useCase.execute(baseInput)).rejects.toThrow('ELECTION_NOT_FOUND');
  });
});
