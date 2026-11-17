import { Logger } from '@nestjs/common';
import { EmailDeliveryException } from 'src/shared/exceptions/base/email-delivery.exception';
import {
  buildPasswordRecoveryEmail,
  buildVerificationEmail,
  NodemailerEmailService,
} from './nodemailer-email.service';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

import { createTransport } from 'nodemailer';

const PALETTE = [
  '#f7f7f8',
  '#ffffff',
  '#1E3A5F',
  '#152942',
  '#26282b',
  '#60656c',
  '#dfe0e2',
  '#C65D2E',
];

describe('buildVerificationEmail', () => {
  it('uses the Spanish subject', () => {
    const { subject } = buildVerificationEmail('483912');
    expect(subject).toBe('Código de verificación de Votium');
  });

  it('includes the code, the 5-minute validity and single use in the text fallback', () => {
    const { text } = buildVerificationEmail('483912');
    expect(text).toContain('Hola,');
    expect(text).toContain('483912');
    expect(text).toContain('válido por 5 minutos');
    expect(text).toContain('solo puede usarse una vez');
    expect(text).toContain('Equipo de Seguridad de Votium');
  });

  it('builds a Spanish HTML document with the intact code and the frontend palette', () => {
    const { html } = buildVerificationEmail('483912');
    expect(html).toContain('lang="es"');
    expect(html).toContain('charset="utf-8"');
    expect(html).toContain('>483912<');
    expect(html).toContain('válido por 5 minutos');
    for (const color of PALETTE) {
      expect(html).toContain(color);
    }
  });

  it('contains no links, images or scripts', () => {
    const { html } = buildVerificationEmail('483912');
    expect(html).not.toMatch(/<a\s|href=|<img|<script|<form/i);
  });

  it('never includes the code in the subject', () => {
    expect(buildVerificationEmail('483912').subject).not.toContain('483912');
  });

  it('never includes password-like values', () => {
    const { text, html } = buildVerificationEmail('483912');
    expect(text).not.toMatch(/password|secret|SecurePassword123!/i);
    expect(html).not.toMatch(/password|secret|SecurePassword123!/i);
  });

  it('escapes the code as HTML text', () => {
    const { html } = buildVerificationEmail('<b>1</b>');
    expect(html).not.toContain('<b>1</b>');
    expect(html).toContain('&lt;b&gt;1&lt;/b&gt;');
  });
});

describe('buildPasswordRecoveryEmail', () => {
  it('uses its own Spanish subject, distinct from the login verification email', () => {
    const { subject } = buildPasswordRecoveryEmail('483912');
    expect(subject).toBe('Código de recuperación de contraseña de Votium');
    expect(subject).not.toBe(buildVerificationEmail('483912').subject);
  });

  it('includes the code, the 15-minute validity and single use in the text fallback', () => {
    const { text } = buildPasswordRecoveryEmail('483912');
    expect(text).toContain('483912');
    expect(text).toContain('válido por 15 minutos');
    expect(text).toContain('solo puede usarse una vez');
    expect(text).not.toContain('intento de inicio de sesión');
  });

  it('builds a Spanish HTML document with the intact code and the frontend palette', () => {
    const { html } = buildPasswordRecoveryEmail('483912');
    expect(html).toContain('lang="es"');
    expect(html).toContain('>483912<');
    expect(html).toContain('Código de recuperación');
    expect(html).not.toContain('intento de inicio de sesión');
    for (const color of PALETTE) {
      expect(html).toContain(color);
    }
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
        html: string;
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
    expect(options.subject).toBe('Código de verificación de Votium');
    expect(options.text).toContain('483912');
    expect(options.html).toContain('483912');
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

  it('sends the password recovery email from the configured sender', async () => {
    sendMail.mockResolvedValue({ messageId: '2' });
    const service = new NodemailerEmailService();

    await service.sendPasswordRecoveryCode('admin@example.com', '654321');

    const options = sendMail.mock.calls[0][0];
    expect(options.to).toBe('admin@example.com');
    expect(options.from).toBe('votiumvalleu@gmail.com');
    expect(options.subject).toBe('Código de recuperación de contraseña de Votium');
    expect(options.text).toContain('654321');
    expect(options.html).toContain('654321');
  });

  it('maps password recovery delivery failures to EmailDeliveryException without leaking the code', async () => {
    sendMail.mockRejectedValue(new Error('smtp down'));
    const service = new NodemailerEmailService();

    const error = await service
      .sendPasswordRecoveryCode('admin@example.com', '654321')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(EmailDeliveryException);
    expect((error as Error).message).not.toContain('654321');
    expect(JSON.stringify(loggerError.mock.calls)).not.toContain('654321');
  });
});
