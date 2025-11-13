import { Controller, Get, Query } from '@nestjs/common';
import { ConfigService } from '../common/config.service';
import { OllamaEmbeddingProvider } from './providers/ollama-embedding.provider';

@Controller('llm')
export class LlmController {
  constructor(
    private readonly cfg: ConfigService,
    private readonly emb: OllamaEmbeddingProvider,
  ) {}

  @Get('models')
  async models() {
    const base = this.cfg.env.OLLAMA_BASE_URL;
    if (!base) return { models: [] };

    const r = await fetch(`${base}/api/tags`);
    const j = await r.json().catch(() => ({ models: [] }));
    return j;
  }

  @Get('embedding-dim')
  async dim(@Query('q') q?: string) {
    const [vec] = await this.emb.embed([q || 'test']);
    return { length: vec.length };
  }
}
