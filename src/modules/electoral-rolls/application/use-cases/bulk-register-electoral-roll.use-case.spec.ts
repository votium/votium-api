import { BadRequestException } from 'src/shared/exceptions/base/bad-request.exception';
import { InternalServerErrorException } from 'src/shared/exceptions/base/internal-server-error.exception';
import { BULK_REGISTER_ELECTORAL_ROLL_AUDIT_ACTION } from '../services/electoral-roll-registration.service';
import type { ElectoralRollCsvParserPort } from '../ports/electoral-roll-csv-parser.port';
import { BulkRegisterElectoralRollUseCase } from './bulk-register-electoral-roll.use-case';

function makeParser(rows: unknown[] = []): ElectoralRollCsvParserPort {
  return { parse: jest.fn().mockReturnValue(rows) };
}

function makeRegistration(result: unknown = undefined): {
  registerPairs: jest.Mock;
} {
  return { registerPairs: jest.fn().mockResolvedValue(result) };
}

const baseInput = {
  electionId: 'election-uuid',
  originalName: 'padron.csv',
  buffer: Buffer.from(''),
  requestingUserId: 'user-uuid',
};

const parsedRows = [{ studentCode: '12345678', programCode: '1234' }];

describe('BulkRegisterElectoralRollUseCase', () => {
  describe('file validation', () => {
    it('BU1: rejects non-CSV files without parsing or delegating', async () => {
      const parser = makeParser();
      const registration = makeRegistration({});
      const useCase = new BulkRegisterElectoralRollUseCase(parser, registration as never);

      await expect(useCase.execute({ ...baseInput, originalName: 'padron.xlsx' })).rejects.toThrow(
        BadRequestException,
      );
      await expect(useCase.execute({ ...baseInput, originalName: 'padron.xlsx' })).rejects.toThrow(
        'Only CSV files are supported.',
      );

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(parser.parse).not.toHaveBeenCalled();

      expect(registration.registerPairs).not.toHaveBeenCalled();
    });

    it('BU2: accepts CSV filenames case-insensitively', async () => {
      const parser = makeParser([]);
      const registration = makeRegistration();
      const useCase = new BulkRegisterElectoralRollUseCase(parser, registration as never);

      const result = await useCase.execute({ ...baseInput, originalName: 'PADRON.CSV' });

      expect(result).toBeUndefined();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(parser.parse).toHaveBeenCalledWith(baseInput.buffer);
    });
  });

  describe('parser error handling', () => {
    it('BU4: rethrows a BadRequestException raised by the parser', async () => {
      const parser = {
        parse: jest.fn().mockImplementation(() => {
          throw new BadRequestException('Invalid CSV format.');
        }),
      };
      const registration = makeRegistration();
      const useCase = new BulkRegisterElectoralRollUseCase(parser, registration as never);

      await expect(useCase.execute(baseInput)).rejects.toThrow('Invalid CSV format.');

      expect(registration.registerPairs).not.toHaveBeenCalled();
    });

    it('BU5: wraps unexpected parser errors as InternalServerErrorException', async () => {
      const parser = {
        parse: jest.fn().mockImplementation(() => {
          throw new Error('boom');
        }),
      };
      const registration = makeRegistration();
      const useCase = new BulkRegisterElectoralRollUseCase(parser, registration as never);

      await expect(useCase.execute(baseInput)).rejects.toThrow(
        'Unexpected error while importing electoral roll.',
      );
      await expect(useCase.execute(baseInput)).rejects.toBeInstanceOf(InternalServerErrorException);

      expect(registration.registerPairs).not.toHaveBeenCalled();
    });
  });

  describe('delegation', () => {
    it('BU3: passes parsed rows, election, requesting user, and the bulk audit action to the registration service', async () => {
      const parser = makeParser(parsedRows);
      const registration = makeRegistration({ totalRows: 1, registered: 1 });
      const useCase = new BulkRegisterElectoralRollUseCase(parser, registration as never);

      const result = await useCase.execute(baseInput);

      expect(result).toEqual({ totalRows: 1, registered: 1 });

      expect(registration.registerPairs).toHaveBeenCalledTimes(1);

      expect(registration.registerPairs).toHaveBeenCalledWith({
        electionId: 'election-uuid',
        rows: parsedRows,
        requestingUserId: 'user-uuid',
        auditAction: BULK_REGISTER_ELECTORAL_ROLL_AUDIT_ACTION,
      });
    });

    it('BU6: returns the registration service result as-is for empty CSV rows', async () => {
      const parser = makeParser([]);
      const registration = makeRegistration({
        totalRows: 0,
        registered: 0,
        alreadyRegistered: 0,
        notFound: 0,
        invalidRows: 0,
        errors: [],
      });
      const useCase = new BulkRegisterElectoralRollUseCase(parser, registration as never);

      const result = await useCase.execute(baseInput);

      expect(result).toEqual({
        totalRows: 0,
        registered: 0,
        alreadyRegistered: 0,
        notFound: 0,
        invalidRows: 0,
        errors: [],
      });

      expect(registration.registerPairs).toHaveBeenCalledWith(
        expect.objectContaining({ rows: [] }),
      );
    });

    it('BU7: propagates domain errors raised by the registration service', async () => {
      const parser = makeParser(parsedRows);
      const registration = {
        registerPairs: jest.fn().mockRejectedValue(new Error('ELECTION_NOT_FOUND')),
      };
      const useCase = new BulkRegisterElectoralRollUseCase(parser, registration as never);

      await expect(useCase.execute(baseInput)).rejects.toThrow('ELECTION_NOT_FOUND');
    });
  });
});
