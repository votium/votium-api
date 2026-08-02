import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { OTP_LENGTH } from 'src/modules/auth/domain/mfa.constants';
import type { OtpGeneratorPort } from '../../application/ports/otp-generator.port';

@Injectable()
export class CryptoOtpGeneratorService implements OtpGeneratorPort {
  generate(): string {
    return randomInt(0, 10 ** OTP_LENGTH)
      .toString()
      .padStart(OTP_LENGTH, '0');
  }
}
