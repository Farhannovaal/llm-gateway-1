import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AiAppsController } from './ai-apps.controller';
import { AiAppsService } from './ai-apps.service';
import { AiApp } from './entities/ai-app.entity';
import { CHAT_DB_CONNECTION } from '../chat-db/chat-db.module';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [AiApp],
      CHAT_DB_CONNECTION,
    ),
  ],
  controllers: [AiAppsController],
  providers: [AiAppsService],
  exports: [AiAppsService],
})
export class AiAppsModule {}
