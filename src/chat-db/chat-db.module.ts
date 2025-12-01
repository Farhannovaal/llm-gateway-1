import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '../common/config.module';
import { ConfigService } from '../common/config.service';

import { ChatSession } from './entities/chat-session.entity';
import { ChatTurn } from './entities/chat-turn.entity';
import { ChatReference } from './entities/chat-reference.entity';

export const CHAT_DB_CONNECTION = 'chatConnection';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync({
      name: CHAT_DB_CONNECTION,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const env = cfg.env;

        return {
          name: CHAT_DB_CONNECTION,
          type: 'mysql',
          host: env.CHAT_DB_HOST || 'localhost',
          port: Number(env.CHAT_DB_PORT || 3306),
          username: env.CHAT_DB_USER || 'dev',
          password: env.CHAT_DB_PASS || '',
          database: env.CHAT_DB_NAME || 'chat_ai_db',
          entities: [ChatSession, ChatTurn, ChatReference],
          synchronize: false,
          logging: env.CHAT_DB_LOGGING === 'true',
        } as any;
      },
    }),
    TypeOrmModule.forFeature(
      [ChatSession, ChatTurn, ChatReference],
      CHAT_DB_CONNECTION,
    ),
  ],
  exports: [
    TypeOrmModule.forFeature(
      [ChatSession, ChatTurn, ChatReference],
      CHAT_DB_CONNECTION,
    ),
  ],
})
export class ChatDbModule {}
