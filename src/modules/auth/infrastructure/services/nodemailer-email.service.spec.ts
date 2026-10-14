import { Logger } from '@nestjs/common';
import { EmailDeliveryException } from 'src/shared/exceptions/base/email-delivery.exception';
import { buildVerificationEmail, NodemailerEmailService } from './nodemailer-email.service';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

import { createTransport } from 'nodemailer';

describe('buildVerificationEmail', () => {
  it('uses the expected subject', () => {
    const { subject } = buildVerificationEmail('483912');
    expect(subject).toBe('Your Votium Verification Code');
  });

  it('includes the verification code in the body', () => {
    const { body } = buildVerificationEmail('483912');
    expect(body).toContain('483912');
  });

  it('mentions validity and single-use constraints', () => {
    const { body } = buildVerificationEmail('483912');
    expect(body).toContain('valid for 5 minutes');
    expect(body).toContain('can only be used once');
  });

  it('never includes password-like values', () => {
    const { body } = buildVerificationEmail('483912');
    expect(body).not.toMatch(/password|secret|SecurePassword123!/i);
  });
});

describe('NodemailerEmailService', () => {
  const sendMail = jest.fn<
    Promise<{ messageId: string }>,
    [
      {
        from: string;
        to: string;
        subject: string;
        text: string;
      },
    ]
  >();
  const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

  beforeEach(() => {
    jest.clearAllMocks();
    (createTransport as jest.Mock).mockReturnValue({ sendMail });
  });

  it('sends the verification email from the configured sender', async () => {
    sendMail.mockResolvedValue({ messageId: '1' });
    const service = new NodemailerEmailService();

    await service.sendVerificationCode('admin@example.com', '483912');

    expect(sendMail).toHaveBeenCalledTimes(1);
    const options = sendMail.mock.calls[0][0];
    expect(options.from).toBe('votiumvalleu@gmail.com');
    expect(options.to).toBe('admin@example.com');
    expect(options.subject).toBe('Your Votium Verification Code');
    expect(options.text).toContain('483912');
  });

  it('maps delivery failures to EmailDeliveryException and logs', async () => {
    sendMail.mockRejectedValue(new Error('smtp down'));
    const service = new NodemailerEmailService();

    await expect(
      service.sendVerificationCode('admin@example.com', '483912'),
    ).rejects.toBeInstanceOf(EmailDeliveryException);
    expect(loggerError).toHaveBeenCalled();
  });

  it('never logs the OTP', async () => {
    sendMail.mockRejectedValue(new Error('smtp down'));
    const service = new NodemailerEmailService();

    await service.sendVerificationCode('admin@example.com', '483912').catch(() => undefined);

    const logged = JSON.stringify(loggerError.mock.calls);
    expect(logged).not.toContain('483912');
  });

  it('never includes the OTP in the thrown error', async () => {
    sendMail.mockRejectedValue(new Error('smtp down'));
    const service = new NodemailerEmailService();

    const error = await service
      .sendVerificationCode('admin@example.com', '483912')
      .catch((e: unknown) => e);

    expect((error as Error).message).not.toContain('483912');
  });
});
