import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const req = ctx.switchToHttp().getRequest();
    const { method, url } = req;
    const start = performance.now();

    return next.handle().pipe(
      tap({
        next: (data) => {
          const ms = Math.round(performance.now() - start);
          const size =
            typeof data === 'string'
              ? data.length
              : Buffer.byteLength(JSON.stringify(data ?? {}));
          this.logger.log(`${method} ${url} - ${ms}ms size=${size}B`);
        },
        error: (err) => {
          const ms = Math.round(performance.now() - start);
          this.logger.warn(`${method} ${url} - ${ms}ms ERROR: ${err?.message || err}`);
        },
      }),
    );
  }
}
