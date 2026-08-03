import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { DomainException } from '../base/domain.exception';
import { ErrorResponseDto } from '../dto/error-response.dto';

const DOMAIN_CODE_TO_HTTP: Record<string, HttpStatus> = {
  NOT_FOUND: HttpStatus.NOT_FOUND,
  USER_NOT_FOUND: HttpStatus.NOT_FOUND,
  ROLE_NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  EMAIL_CONFLICT: HttpStatus.CONFLICT,
  USER_ALREADY_DISABLED: HttpStatus.CONFLICT,
  VALIDATION_ERROR: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_CREDENTIALS: HttpStatus.UNAUTHORIZED,
  INVALID_TOKEN: HttpStatus.UNAUTHORIZED,
  USER_SELF_DISABLE: HttpStatus.FORBIDDEN,
  BAD_REQUEST: HttpStatus.BAD_REQUEST,
  UNAUTHORIZED: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  GONE: HttpStatus.GONE,
  TOO_MANY_REQUESTS: HttpStatus.TOO_MANY_REQUESTS,
  EMAIL_DELIVERY_ERROR: HttpStatus.INTERNAL_SERVER_ERROR,
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const errorResponse = this.buildErrorResponse(exception, request.url);

    const { statusCode } = errorResponse;

    const message = Array.isArray(errorResponse.message)
      ? errorResponse.message.join(', ')
      : errorResponse.message;

    if (statusCode >= 500) {
      this.logger.error(exception);
    } else {
      this.logger.warn(`${request.method} ${request.originalUrl} -> ${statusCode} ${message}`);
    }

    response.status(statusCode).json(errorResponse);
  }

  private buildErrorResponse(exception: unknown, path: string): ErrorResponseDto {
    const timestamp = new Date().toISOString();

    if (exception instanceof DomainException) {
      const statusCode = DOMAIN_CODE_TO_HTTP[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;

      return new ErrorResponseDto({
        statusCode,
        error: exception.code,
        message: exception.message,
        timestamp,
        path,
      });
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

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

    this.logger.fatal('Unhandled exception', exception);
    return new ErrorResponseDto({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred. Please try again later.',
      timestamp,
      path,
    });
  }
}
