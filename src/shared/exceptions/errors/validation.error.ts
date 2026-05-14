/* Casos de uso:

Una fecha de cierre anterior a la fecha de inicio
Un porcentaje que sumado a otros supera el 100%
Un mínimo mayor que el máximo
Crear una votación con 0 opciones
 */

import { DomainError } from './domain.error';

export class ValidationError extends DomainError {
   readonly statusCode = 422;
   readonly errorCode = 'VALIDATION_ERROR';

   constructor(message: string) {
      super(message);
   }
}