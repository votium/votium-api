import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class CertificateNotAvailableError extends ConflictException {
  constructor(electionId: string) {
    super(`No hay un voto confirmado para la elección ${electionId}.`, 'CERTIFICATE_NOT_AVAILABLE');
  }
}
