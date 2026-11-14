import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { FabricError } from './fabric.error';

@Catch(FabricError)
export class FabricExceptionFilter implements ExceptionFilter {
  catch(exception: FabricError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse();
    res
      .status(exception.httpStatus)
      .json({ statusCode: exception.httpStatus, ...exception.toResponse() });
  }
}
