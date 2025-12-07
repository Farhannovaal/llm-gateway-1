import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { KbDocument } from './kb-document.entity';
import { KbDocumentService } from './kb-document.service';
import { KbDocumentController } from './kb-document.controller';

import { RagService } from '../rag/rag.service';
import { QdrantService } from '../rag/qdrant.service';
import { OllamaEmbeddingProvider } from '../llm/providers/ollama-embedding.provider';
import { QdrantRagRepository } from '../rag/repository/qdrant-rag.repository';

import { CHAT_DB_CONNECTION } from '../chat-db/chat-db.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([KbDocument], CHAT_DB_CONNECTION),
  ],
  controllers: [KbDocumentController],
  providers: [
    KbDocumentService,

    RagService,
    QdrantRagRepository, 
    QdrantService,
    OllamaEmbeddingProvider,
  ],
  exports: [KbDocumentService],
})
export class KbModule {}
