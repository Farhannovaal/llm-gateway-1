import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { RagModule } from '../rag/rag.module';

import { ChatService } from './chat.service';
import { ChatRagService } from './chat-rag.service';
import { ChatController } from './chat.controller';
import { ChatLogService } from '../chat-db/chat-log.service';
import { ChatDbModule } from '../chat-db/chat-db.module';

import { AiAppsModule } from '../ai-apps/ai-apps.module';
import { AiAssistantsModule } from '../ai-assistants/ai-assistant.module';

@Module({
  imports: [
    LlmModule,
    RagModule,
    ChatDbModule,
    AiAppsModule,
    AiAssistantsModule,
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatRagService, ChatLogService],
  exports: [ChatService, ChatRagService, ChatLogService],
})
export class ChatModule {}
