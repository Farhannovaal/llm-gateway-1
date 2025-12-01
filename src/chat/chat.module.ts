import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { RagModule } from '../rag/rag.module';

import { ChatService } from './chat.service';
import { ChatRagService } from './chat-rag.service';
import { ChatController } from './chat.controller';
import { ChatLogService } from 'src/chat-db/chat-log.service';
import { ChatDbModule } from 'src/chat-db/chat-db.module';

@Module({
  imports: [LlmModule, RagModule, ChatDbModule],
  controllers: [ChatController],             
  providers: [ChatService, ChatRagService,ChatLogService],
  exports: [ChatService, ChatRagService, ChatLogService],
})
export class ChatModule {}
