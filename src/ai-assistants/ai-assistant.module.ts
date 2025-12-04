import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AiAssistantsController } from './ai-assistant.controller';
import { AiAssistantsService } from './ai-assistants.service';
import { AiAssistant } from './entities/ai-assistant.entity';
import { CHAT_DB_CONNECTION } from '../chat-db/chat-db.module';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [AiAssistant],
      CHAT_DB_CONNECTION,
    ),
  ],
  controllers: [AiAssistantsController],
  providers: [AiAssistantsService],
  exports: [AiAssistantsService],
})
export class AiAssistantsModule {}
