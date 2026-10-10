export const OTP_GENERATOR_PORT = 'OtpGeneratorPort';

export interface OtpGeneratorPort {
  generate(): string;
}
