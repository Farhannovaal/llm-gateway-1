import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AiAppsService } from '../../ai-apps/ai-apps.service';
import { AiAssistantsService } from '../../ai-assistants/ai-assistants.service';
import { AiApp } from '../../ai-apps/entities/ai-app.entity';
import { AiAssistant } from '../../ai-assistants/entities/ai-assistant.entity';
import { CHAT_DB_CONNECTION } from '../../chat-db/chat-db.module';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [AiApp, AiAssistant],
      CHAT_DB_CONNECTION,
    ),
  ],
  providers: [AiAppsService, AiAssistantsService],
  exports: [AiAppsService, AiAssistantsService],
})
export class ServicesMarketModule {}
