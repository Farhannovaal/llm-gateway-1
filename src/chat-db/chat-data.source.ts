import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';

import { ChatSession } from './entities/chat-session.entity';
import { ChatTurn } from './entities/chat-turn.entity';
import { ChatReference } from './entities/chat-reference.entity';

const ChatDataSource = new DataSource({
  type: 'mysql',
  host: process.env.CHAT_DB_HOST || 'localhost',
  port: Number(process.env.CHAT_DB_PORT || 3306),
  username: process.env.CHAT_DB_USER || 'root',
  password: process.env.CHAT_DB_PASS || '',
  database: process.env.CHAT_DB_NAME || 'chat_ai_db',
  entities: [ChatSession, ChatTurn, ChatReference],
  migrations: ['src/chat-db/migrations/*.{ts,js}'],
  synchronize: false,
  logging: process.env.CHAT_DB_LOGGING === 'true',
});

export default ChatDataSource;
