import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { RagModule } from '../rag/rag.module';

import { ChatService } from './chat.service';
import { ChatRagService } from './chat-rag.service';
import { ChatController } from './chat.controller';

@Module({
  imports: [LlmModule, RagModule],
  controllers: [ChatController],             
  providers: [ChatService, ChatRagService],
  exports: [ChatService, ChatRagService],
})
export class ChatModule {}
