/* Casos de uso:

Buscar un usuario por ID que no existe
Editar un recurso que fue eliminado
Acceder a una relación que ya no existe (ej. el postId de un comentario) 
*/

import { DomainError } from './domain.error';

export class NotFoundError extends DomainError {
  readonly statusCode = 404;
  readonly errorCode = 'NOT_FOUND';

  constructor(resource: string, identifier?: string | number) {
    super(
      identifier ? `${resource} con id ${identifier} no encontrado` : `${resource} no encontrado`,
    );
  }
}
