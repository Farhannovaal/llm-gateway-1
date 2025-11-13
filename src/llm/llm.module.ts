import { Module } from '@nestjs/common';
import { ConfigModule } from '../common/config.module';
import { LlmService } from './llm.service';
import { LlmController } from './llm.controller';
import { OllamaEmbeddingProvider } from './providers/ollama-embedding.provider';

@Module({
  imports: [ConfigModule],
  controllers: [LlmController],
  providers: [LlmService, OllamaEmbeddingProvider],
  exports: [LlmService, OllamaEmbeddingProvider],
})
export class LlmModule {}
