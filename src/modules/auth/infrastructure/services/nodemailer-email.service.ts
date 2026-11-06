import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { envs } from 'src/config';
import { EmailDeliveryException } from 'src/shared/exceptions/base/email-delivery.exception';
import type { EmailServicePort } from '../../application/ports/email-service.port';

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

@Injectable()
export class NodemailerEmailService implements EmailServicePort {
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
}
