import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FabricError, validationError } from '../errors/fabric.error';

/** Validates before anything leaves the backend. Errors name the field and the rule, never the value. */
export async function validateInput<T extends object>(
  cls: new () => T,
  input: unknown,
): Promise<T> {
  if (input === null || typeof input !== 'object') {
    throw validationError([{ field: '(root)', rule: 'isObject' }]);
  }
  const instance = plainToInstance(cls, input);
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
    stopAtFirstError: true,
    validationError: { target: false, value: false },
  });
  if (errors.length > 0) {
    throw validationError(
      errors.map((e) => ({
        field: e.property,
        rule: Object.keys(e.constraints ?? {})[0] ?? 'invalid',
      })),
    );
  }
  return instance;
}

export const assertEndAfterStart = (startDate: string, endDate: string): void => {
  if (Date.parse(startDate) >= Date.parse(endDate)) {
    throw validationError([{ field: 'endDate', rule: 'isAfterStartDate' }]);
  }
};

export type { FabricError };
