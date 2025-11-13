import { Module } from '@nestjs/common';
import { ConfigModule } from '../common/config.module';
import { QdrantService } from './qdrant.service';
import { RagService } from './rag.service';
import { RagController } from './rag.controller';
import { OllamaEmbeddingProvider } from '../llm/providers/ollama-embedding.provider';

@Module({
  imports: [ConfigModule],
  controllers: [RagController],
  providers: [QdrantService, OllamaEmbeddingProvider, RagService],
  exports: [RagService],
})
export class RagModule {}
