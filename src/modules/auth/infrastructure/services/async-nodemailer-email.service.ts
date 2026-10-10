import { Injectable, Logger } from '@nestjs/common';
import type { AsyncEmailServicePort } from '../../application/ports/async-email-service.port';
import type { EmailServicePort } from '../../application/ports/email-service.port';

@Injectable()
export class AsyncNodemailerEmailService implements AsyncEmailServicePort {
  private readonly logger = new Logger(AsyncNodemailerEmailService.name);

  constructor(private readonly emailService: EmailServicePort) {}

  sendVerificationCode(to: string, code: string): Promise<void> {
    return this.emailService.sendVerificationCode(to, code);
  }

  queueVerificationCode(to: string, code: string): Promise<void> {
    void this.dispatch(to, code);
    return Promise.resolve();
  }

  private async dispatch(to: string, code: string): Promise<void> {
    try {
      await this.emailService.sendVerificationCode(to, code);
    } catch (error) {
      this.logger.error('Failed to send MFA verification email', error);
    }
  }
}
