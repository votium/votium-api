import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { DomainError } from '../errors/domain.error';
import { ErrorResponseDto } from '../dto/error-response.dto';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const errorResponse = this.buildErrorResponse(exception, request.url);

    // Loguea el error completo internamente, solo el resumen al cliente
    this.logger.error(
      `[${request.method}] ${request.url} → ${errorResponse.statusCode}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    response.status(errorResponse.statusCode).json(errorResponse);
  }

  private buildErrorResponse(exception: unknown, path: string): ErrorResponseDto {
    const timestamp = new Date().toISOString();

    // 1. Error de dominio propio (NotFoundError, ConflictError, etc.)
    if (exception instanceof DomainError) {
      return new ErrorResponseDto({
        statusCode: exception.statusCode,
        error: exception.errorCode,
        message: exception.message,
        timestamp,
        path,
      });
    }

    // 2. HttpException de NestJS (incluye errores de class-validator via ValidationPipe)
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      // class-validator devuelve un objeto con { message: string[] }
      const message =
        typeof exceptionResponse === 'object' && 'message' in exceptionResponse
          ? exceptionResponse.message
          : exception.message;

      return new ErrorResponseDto({
        statusCode: status,
        error: exception.name.replace('Exception', ''),
        message:
          typeof message === 'string'
            ? message
            : Array.isArray(message)
              ? message
              : String(message),
        timestamp,
        path,
      });
    }

    // 3. Error inesperado — nunca exponer detalles internos al cliente
    this.logger.fatal('Unhandled exception', exception);
    return new ErrorResponseDto({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Ocurrió un error inesperado. Intenta de nuevo más tarde.',
      timestamp,
      path,
    });
  }
}
