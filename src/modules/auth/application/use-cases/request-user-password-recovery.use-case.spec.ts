import { Logger } from '@nestjs/common';
import {
  GENERIC_PASSWORD_RECOVERY_MESSAGE,
  PASSWORD_RECOVERY_TTL_MS,
} from 'src/shared/constants/password-recovery.constants';
import type { UserRepository } from 'src/modules/iam/domain/repositories/user.repository.interface';
import { RequestUserPasswordRecoveryUseCase } from './request-user-password-recovery.use-case';

const ACCOUNT_ID = 'account-1';
const CODE = '012345';

type Account = { id: string | null; email: string; isDeleted(): boolean; isActive(): boolean };

function account(overrides: Partial<{ deleted: boolean; active: boolean }> = {}): Account {
  return {
    id: ACCOUNT_ID,
    email: 'person@example.com',
    isDeleted: () => overrides.deleted ?? false,
    isActive: () => overrides.active ?? true,
  };
}

describe('RequestUserPasswordRecoveryUseCase', () => {
  const findByEmail = jest.fn<Promise<Account | null>, [string]>();
  const findActiveCreatedAt = jest.fn<Promise<Date | null>, [string, Date]>();
  const replaceActive = jest.fn<Promise<void>, [unknown]>();
  const deleteCodes = jest.fn<Promise<void>, [string]>();
  const generate = jest.fn<string, []>();
  const hash = jest.fn<Promise<string>, [string]>();
  const send = jest.fn<Promise<void>, [string, string]>();
  const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

  let useCase: RequestUserPasswordRecoveryUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    findByEmail.mockResolvedValue(account());
    findActiveCreatedAt.mockResolvedValue(null);
    replaceActive.mockResolvedValue(undefined);
    deleteCodes.mockResolvedValue(undefined);
    generate.mockReturnValue(CODE);
    hash.mockResolvedValue('hashed-code');
    send.mockResolvedValue(undefined);

    useCase = new RequestUserPasswordRecoveryUseCase(
      { findByEmail } as unknown as UserRepository,
      { findActiveCreatedAt, replaceActive, deleteByUserId: deleteCodes } as never,
      { generate },
      { hash, verify: jest.fn() },
      { sendPasswordRecoveryCode: send },
    );
  });

  const run = () => useCase.execute({ email: 'person@example.com' });

  it.each([
    ['does not exist', null],
    ['is deleted', account({ deleted: true })],
    ['is not active', account({ active: false })],
  ])('returns the generic message without code or email when the account %s', async (_l, acc) => {
    findByEmail.mockResolvedValue(acc);

    await expect(run()).resolves.toEqual({ message: GENERIC_PASSWORD_RECOVERY_MESSAGE });
    expect(replaceActive).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('stores only the hash with a 15-minute expiry before sending the code', async () => {
    const before = Date.now();

    await expect(run()).resolves.toEqual({ message: GENERIC_PASSWORD_RECOVERY_MESSAGE });

    expect(hash).toHaveBeenCalledWith(CODE);
    const stored = replaceActive.mock.calls[0][0] as {
      userId: string;
      codeHash: string;
      expiresAt: Date;
    };
    expect(stored.userId).toBe(ACCOUNT_ID);
    expect(stored.codeHash).toBe('hashed-code');
    expect(JSON.stringify(stored)).not.toContain(CODE);
    const ttl = stored.expiresAt.getTime() - before;
    expect(ttl).toBeGreaterThanOrEqual(PASSWORD_RECOVERY_TTL_MS - 1000);
    expect(ttl).toBeLessThanOrEqual(PASSWORD_RECOVERY_TTL_MS + 1000);
    expect(send).toHaveBeenCalledWith('person@example.com', CODE);
    expect(replaceActive.mock.invocationCallOrder[0]).toBeLessThan(
      send.mock.invocationCallOrder[0],
    );
  });

  it('deletes the code and still answers generically when the email fails, never logging the code', async () => {
    send.mockRejectedValue(new Error('smtp down'));

    await expect(run()).resolves.toEqual({ message: GENERIC_PASSWORD_RECOVERY_MESSAGE });
    expect(deleteCodes).toHaveBeenCalledWith(ACCOUNT_ID);
    expect(loggerError).toHaveBeenCalled();
    expect(JSON.stringify(loggerError.mock.calls)).not.toContain(CODE);
  });

  it('does not generate or send a new code inside the 60 s cooldown', async () => {
    findActiveCreatedAt.mockResolvedValue(new Date(Date.now() - 30_000));

    await expect(run()).resolves.toEqual({ message: GENERIC_PASSWORD_RECOVERY_MESSAGE });
    expect(generate).not.toHaveBeenCalled();
    expect(replaceActive).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('generates a new code once the cooldown has elapsed', async () => {
    findActiveCreatedAt.mockResolvedValue(new Date(Date.now() - 61_000));

    await run();

    expect(replaceActive).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
