/* Casos de uso:

Registrar un email que ya está en uso
Crear un nombre de usuario que ya existe
Intentar publicar una votación que ya está publicada
Votar dos veces en la misma opción
 */

import { DomainError } from './domain.error';

export class ConflictError extends DomainError {
   readonly statusCode = 409;
   readonly errorCode = 'CONFLICT';

   constructor(message: string) {
      super(message);
   }
}