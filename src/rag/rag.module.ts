import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RagController } from './rag.controller';
import { RagService } from './rag.service';
import { QdrantService } from './qdrant.service';
import { OllamaEmbeddingProvider } from '../llm/providers/ollama-embedding.provider';
import { CHAT_DB_CONNECTION } from '../chat-db/chat-db.module';
import { KbDocument } from '../kb/kb-document.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([KbDocument], CHAT_DB_CONNECTION),
  ],
  controllers: [RagController],
  providers: [RagService, QdrantService, OllamaEmbeddingProvider],
  exports: [RagService],
})
export class RagModule {}
