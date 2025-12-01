import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ChatTurn } from '../chat-db/entities/chat-turn.entity';
import { ChatReference } from '../chat-db/entities/chat-reference.entity';
import { ChatSession } from '../chat-db/entities/chat-session.entity';
import { CHAT_DB_CONNECTION, ChatDbModule } from '../chat-db/chat-db.module';
import { LlmModule } from '../llm/llm.module';

import { ChatAnalyticsService } from './chat-analytics.service';
import { ChatAnalyticsController } from './chat-analytics.controller';

@Module({
  imports: [
    ChatDbModule,
    LlmModule,
    TypeOrmModule.forFeature(
      [ChatTurn, ChatReference, ChatSession],
      CHAT_DB_CONNECTION,
    ),
  ],
  controllers: [ChatAnalyticsController],
  providers: [ChatAnalyticsService],
  exports: [ChatAnalyticsService],
})
export class ChatAnalyticsModule {}
