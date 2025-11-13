import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { ConfigModule } from './common/config.module';
import { LlmModule } from './llm/llm.module';
import { ChatModule } from './chat/chat.module';
import { HealthModule } from './health/health.module';
import { RagModule } from './rag/rag.module';

import { UserThrottlerGuard } from './common/guards/user-throttler.guard';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { LlmService } from './llm/llm.service';

@Module({
  imports: [
    ConfigModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: parseInt(process.env.RATE_LIMIT_PER_MIN ?? '60', 10),
      },
    ]),
    LlmModule,
    ChatModule,
    HealthModule,
    RagModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule implements OnModuleInit {
  private readonly logger = new Logger(AppModule.name);

  constructor(private readonly llm: LlmService) {}

  async onModuleInit() {
    try {
      await this.llm.chat([{ role: 'user', content: 'ping' }]);
      this.logger.log('LLM warm-up: OK');
    } catch (e: any) {
      this.logger.warn(`LLM warm-up gagal: ${e?.message || e}`);
    }
  }
}
