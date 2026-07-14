import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { captureException } from '../sentry';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    private readonly logger = new Logger(AllExceptionsFilter.name);

    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        let status = HttpStatus.INTERNAL_SERVER_ERROR;
        let message: string | object = 'Internal server error';

        if (exception instanceof HttpException) {
            status = exception.getStatus();
            const exceptionResponse = exception.getResponse();
            message = typeof exceptionResponse === 'string'
                ? exceptionResponse
                : exceptionResponse;
        } else if (exception instanceof Error) {
            this.logger.error(
                `Unhandled exception on ${request.method} ${request.url}: ${exception.message}`,
                exception.stack,
            );
            captureException(exception, {
                method: request.method,
                url: request.url,
                userId: (request as any).user?.sub,
            });
            message = 'Internal server error';
        }

        const errorResponse = {
            statusCode: status,
            timestamp: new Date().toISOString(),
            path: request.url,
            method: request.method,
            ...(typeof message === 'string' ? { message } : message),
        };

        response.status(status).json(errorResponse);
    }
}
