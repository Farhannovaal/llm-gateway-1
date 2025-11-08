import { Module } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from './common/config.module';
import { LlmModule } from './llm/llm.module';
import { ChatModule } from './chat/chat.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule,
    ThrottlerModule.forRoot([
      { ttl: 60_000, limit: parseInt(process.env.RATE_LIMIT_PER_MIN ?? '60', 10) },
    ]),
    LlmModule,
    ChatModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
