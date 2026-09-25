import { Logger } from '@nestjs/common';
import { AsyncNodemailerEmailService } from './async-nodemailer-email.service';
import type { EmailServicePort } from '../../application/ports/email-service.port';

describe('AsyncNodemailerEmailService', () => {
  let sendVerificationCode: jest.Mock<Promise<void>, [string, string]>;
  let emailService: EmailServicePort;
  let service: AsyncNodemailerEmailService;

  let loggerError: jest.SpyInstance;

  beforeEach(() => {
    sendVerificationCode = jest.fn<Promise<void>, [string, string]>();
    emailService = { sendVerificationCode };
    service = new AsyncNodemailerEmailService(emailService);
    loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    loggerError.mockRestore();
  });

  it('delegates sendVerificationCode to the wrapped transport', async () => {
    sendVerificationCode.mockResolvedValue(undefined);

    await service.sendVerificationCode('admin@example.com', '483912');

    expect(sendVerificationCode).toHaveBeenCalledTimes(1);
    expect(sendVerificationCode).toHaveBeenCalledWith('admin@example.com', '483912');
  });

  it('lets sendVerificationCode rejections propagate', async () => {
    sendVerificationCode.mockRejectedValue(new Error('smtp down'));

    await expect(service.sendVerificationCode('admin@example.com', '483912')).rejects.toThrow(
      'smtp down',
    );
  });

  it('resolves queueVerificationCode without waiting for the email to be sent', async () => {
    let release: (() => void) | undefined;
    sendVerificationCode.mockImplementation(
      () => new Promise<void>((resolve) => (release = resolve)),
    );

    await service.queueVerificationCode('admin@example.com', '483912');

    expect(sendVerificationCode).toHaveBeenCalledTimes(1);
    expect(sendVerificationCode).toHaveBeenCalledWith('admin@example.com', '483912');

    release?.();
    await sendVerificationCode.mock.results[0].value;
  });

  it('logs nothing when the background send succeeds', async () => {
    sendVerificationCode.mockResolvedValue(undefined);

    await service.queueVerificationCode('admin@example.com', '483912');
    await sendVerificationCode.mock.results[0].value;

    expect(loggerError).not.toHaveBeenCalled();
  });

  it('logs the background send failure without rejecting queueVerificationCode', async () => {
    sendVerificationCode.mockRejectedValue(new Error('smtp down'));

    await service.queueVerificationCode('admin@example.com', '483912');
    await (sendVerificationCode.mock.results[0].value as Promise<void>).catch(() => undefined);

    expect(loggerError).toHaveBeenCalled();
  });

  it('never leaks the OTP in the failure log', async () => {
    sendVerificationCode.mockRejectedValue(new Error('smtp down'));

    await service.queueVerificationCode('admin@example.com', '483912');
    await (sendVerificationCode.mock.results[0].value as Promise<void>).catch(() => undefined);

    const logged = JSON.stringify(loggerError.mock.calls);
    expect(logged).not.toContain('483912');
  });
});
