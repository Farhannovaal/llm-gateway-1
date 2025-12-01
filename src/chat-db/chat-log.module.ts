import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatSession } from './entities/chat-session.entity';
import { ChatTurn } from './entities/chat-turn.entity';
import { ChatReference } from './entities/chat-reference.entity';
import { ChatLogService } from './chat-log.service';
import { CHAT_DB_CONNECTION } from './chat-db.module';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [ChatSession, ChatTurn, ChatReference],
      CHAT_DB_CONNECTION,
    ),
  ],
  providers: [ChatLogService],
  exports: [ChatLogService],
})
export class ChatLogModule {}
