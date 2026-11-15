import type { ConsumeRecoveryCodeOutcome } from '../../domain/repositories/password-recovery-code.repository.interface';
import { ExpiredRecoveryCodeException } from '../../domain/exceptions/expired-recovery-code.exception';
import { InvalidRecoveryCodeException } from '../../domain/exceptions/invalid-recovery-code.exception';
import { RecoveryCodeAlreadyUsedException } from '../../domain/exceptions/recovery-code-already-used.exception';
import type { UserRepository } from 'src/modules/iam/domain/repositories/user.repository.interface';
import { ResetUserPasswordUseCase } from './reset-user-password.use-case';

const ACCOUNT_ID = 'account-1';

type Account = { id: string | null; isDeleted(): boolean; isActive(): boolean };

function account(overrides: Partial<{ deleted: boolean; active: boolean }> = {}): Account {
  return {
    id: ACCOUNT_ID,
    isDeleted: () => overrides.deleted ?? false,
    isActive: () => overrides.active ?? true,
  };
}

describe('ResetUserPasswordUseCase', () => {
  const findByEmail = jest.fn<Promise<Account | null>, [string]>();
  const consume = jest.fn<Promise<ConsumeRecoveryCodeOutcome>, [Record<string, unknown>]>();
  const mfaHash = jest.fn<Promise<string>, [string]>();
  const passwordHash = jest.fn<Promise<string>, [string]>();

  let useCase: ResetUserPasswordUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    findByEmail.mockResolvedValue(account());
    consume.mockResolvedValue('updated');
    mfaHash.mockResolvedValue('hashed-code');
    passwordHash.mockResolvedValue('hashed-password');

    useCase = new ResetUserPasswordUseCase(
      { findByEmail } as unknown as UserRepository,
      { consumeAndResetPassword: consume } as never,
      { hash: mfaHash, verify: jest.fn() },
      { hash: passwordHash, verify: jest.fn() },
    );
  });

  const run = () =>
    useCase.execute({ email: 'person@example.com', code: '123456', newPassword: 'NewSecret123!' });

  it('updates the password and passes only hashes to the repository', async () => {
    await expect(run()).resolves.toEqual({ message: 'Password updated successfully.' });

    expect(mfaHash).toHaveBeenCalledWith('123456');
    expect(passwordHash).toHaveBeenCalledWith('NewSecret123!');
    const args = consume.mock.calls[0][0];
    expect(args).toMatchObject({
      userId: ACCOUNT_ID,
      codeHash: 'hashed-code',
      passwordHash: 'hashed-password',
    });
    expect(JSON.stringify(args)).not.toContain('123456');
  });

  it.each<[ConsumeRecoveryCodeOutcome, new () => Error, string]>([
    ['invalid', InvalidRecoveryCodeException, 'RECOVERY_CODE_INVALID'],
    ['attempts_exceeded', InvalidRecoveryCodeException, 'RECOVERY_CODE_INVALID'],
    ['expired', ExpiredRecoveryCodeException, 'RECOVERY_CODE_EXPIRED'],
    ['used', RecoveryCodeAlreadyUsedException, 'RECOVERY_CODE_ALREADY_USED'],
  ])('maps the "%s" outcome to %p', async (outcome, errorClass, code) => {
    consume.mockResolvedValue(outcome);

    const error = await run().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(errorClass);
    expect((error as { code: string }).code).toBe(code);
  });

  it.each([
    ['does not exist', null],
    ['is deleted', account({ deleted: true })],
    ['is not active', account({ active: false })],
  ])('rejects with RECOVERY_CODE_INVALID when the account %s', async (_l, acc) => {
    findByEmail.mockResolvedValue(acc);

    await expect(run()).rejects.toBeInstanceOf(InvalidRecoveryCodeException);
    expect(consume).not.toHaveBeenCalled();
  });
});
