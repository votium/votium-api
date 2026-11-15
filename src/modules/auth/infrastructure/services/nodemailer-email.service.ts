import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { envs } from 'src/config';
import { EmailDeliveryException } from 'src/shared/exceptions/base/email-delivery.exception';
import type { EmailServicePort } from '../../application/ports/email-service.port';
import type { PasswordRecoveryEmailPort } from '../../application/ports/password-recovery-email.port';

export function buildVerificationEmail(code: string): { subject: string; body: string } {
  const subject = 'Your Votium Verification Code';
  const body = [
    'Hello,',
    '',
    'A login attempt has been detected for your Votium account.',
    '',
    'Please enter the following verification code to complete your authentication:',
    '',
    code,
    '',
    'This code is valid for 5 minutes and can only be used once.',
    '',
    'If you did not attempt to sign in, please ignore this email and contact your system administrator.',
    '',
    'Regards,',
    '',
    'Votium Security Team',
  ].join('\n');

  return { subject, body };
}

export function buildPasswordRecoveryEmail(code: string): { subject: string; body: string } {
  const subject = 'Your Votium Password Recovery Code';
  const body = [
    'Hello,',
    '',
    'We received a request to reset the password of your Votium account.',
    '',
    'Please enter the following recovery code to set a new password:',
    '',
    code,
    '',
    'This code is valid for 15 minutes and can only be used once.',
    '',
    'If you did not request a password reset, please ignore this email. Your password will not change.',
    '',
    'Regards,',
    '',
    'Votium Security Team',
  ].join('\n');

  return { subject, body };
}

@Injectable()
export class NodemailerEmailService implements EmailServicePort, PasswordRecoveryEmailPort {
  private readonly logger = new Logger(NodemailerEmailService.name);
  private readonly transporter: Transporter<SMTPTransport.SentMessageInfo>;

  constructor() {
    this.transporter = createTransport({
      host: envs.smtpHost,
      port: envs.smtpPort,
      secure: envs.smtpSecure,
      auth: {
        user: envs.smtpUser,
        pass: envs.smtpPass,
      },
    });
  }

  async sendVerificationCode(to: string, code: string): Promise<void> {
    const { subject, body } = buildVerificationEmail(code);
    try {
      await this.transporter.sendMail({
        from: envs.emailFrom,
        to,
        subject,
        text: body,
      });
    } catch (error) {
      this.logger.error(`Failed to send verification email to ${to}`, error);
      throw new EmailDeliveryException('Unable to send verification email.');
    }
  }

  async sendPasswordRecoveryCode(to: string, code: string): Promise<void> {
    const { subject, body } = buildPasswordRecoveryEmail(code);
    try {
      await this.transporter.sendMail({
        from: envs.emailFrom,
        to,
        subject,
        text: body,
      });
    } catch (error) {
      this.logger.error(`Failed to send password recovery email to ${to}`, error);
      throw new EmailDeliveryException('Unable to send password recovery email.');
    }
  }
}
