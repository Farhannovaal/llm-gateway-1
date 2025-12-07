// src/rag/rag.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { KbDocument } from '../kb/kb-document.entity';
import { CHAT_DB_CONNECTION } from '../chat-db/chat-db.module';

import { RagService } from './rag.service';
import { QdrantRagRepository } from './repository/qdrant-rag.repository';
import { QdrantService } from './qdrant.service';
import { OllamaEmbeddingProvider } from '../llm/providers/ollama-embedding.provider';

@Module({
  imports: [TypeOrmModule.forFeature([KbDocument], CHAT_DB_CONNECTION)],
  providers: [RagService, QdrantRagRepository, QdrantService, OllamaEmbeddingProvider],
  exports: [RagService],
})
export class RagModule {}
