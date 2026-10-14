import { CryptoOtpGeneratorService } from './crypto-otp-generator.service';

describe('CryptoOtpGeneratorService', () => {
  const service = new CryptoOtpGeneratorService();

  it('generates exactly six digits', () => {
    const code = service.generate();
    expect(code).toMatch(/^\d{6}$/);
  });

  it('generates numeric values only', () => {
    const code = service.generate();
    expect(Number.isInteger(Number(code))).toBe(true);
  });

  it('keeps the six-digit format across many runs', () => {
    const codes = Array.from({ length: 1000 }, () => service.generate());
    for (const code of codes) {
      expect(code).toMatch(/^\d{6}$/);
    }
    expect(new Set(codes).size).toBeGreaterThan(1);
  });
});
