import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as dotenv from 'dotenv';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalInterceptors(new LoggingInterceptor());
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
