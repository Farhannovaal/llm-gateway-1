import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ChatSession } from './entities/chat-session.entity';
import { ChatTurn } from './entities/chat-turn.entity';
import { ChatReference } from './entities/chat-reference.entity';
import { KbDocument } from '../kb/kb-document.entity';

export const CHAT_DB_CONNECTION = 'chat-db';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      name: CHAT_DB_CONNECTION,
      useFactory: () => ({
        type: 'mysql',
        host: process.env.CHAT_DB_HOST,
        port: Number(process.env.CHAT_DB_PORT ?? 3306),
        username: process.env.CHAT_DB_USER,
        password: process.env.CHAT_DB_PASS,
        database: process.env.CHAT_DB_NAME,
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),

    TypeOrmModule.forFeature(
      [ChatSession, ChatTurn, ChatReference, KbDocument],
      CHAT_DB_CONNECTION,
    ),
  ],
  exports: [TypeOrmModule],
})
export class ChatDbModule {}
