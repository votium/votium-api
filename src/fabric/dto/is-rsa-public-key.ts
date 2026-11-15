import { createPublicKey } from 'node:crypto';
import { registerDecorator, ValidationOptions } from 'class-validator';

const SPKI_PEM = /^-----BEGIN PUBLIC KEY-----[\s\S]+-----END PUBLIC KEY-----\s*$/;

/** RSA public key (SPKI PEM) of at least 2048 bits. A private key never passes, so it can never reach the network. */
export function IsRsaPublicKey(options?: ValidationOptions) {
  return (object: object, propertyName: string): void =>
    registerDecorator({
      name: 'isRsaPublicKey',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string' || !SPKI_PEM.test(value)) return false;
          try {
            const key = createPublicKey(value);
            return (
              key.asymmetricKeyType === 'rsa' &&
              (key.asymmetricKeyDetails?.modulusLength ?? 0) >= 2048
            );
          } catch {
            return false;
          }
        },
      },
    });
}
