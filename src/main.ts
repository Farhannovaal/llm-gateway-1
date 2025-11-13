import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import type { Request, Response, NextFunction } from 'express';

process.on('unhandledRejection', (r) =>
  console.error('[unhandledRejection]', r),
);
process.on('uncaughtException', (e) =>
  console.error('[uncaughtException]', e),
);

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  const logger = new Logger('Bootstrap');

  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.use((req: Request, res: Response, next: NextFunction) => {
    const t0 = Date.now();
    res.on('finish', () => {
      console.log(
        `[HTTP] ${req.method} ${req.url} -> ${res.statusCode} ${
          Date.now() - t0
        }ms`,
      );
    });
    next();
  });

  app.enableShutdownHooks();

  const port = Number.parseInt(process.env.PORT ?? '3000', 10);
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(port, host);
  logger.log(`HTTP listening at http://${host}:${port}`);
}

bootstrap();
