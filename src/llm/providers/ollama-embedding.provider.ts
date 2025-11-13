import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { ConfigService } from '../../common/config.service';

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
  hash(text: string): string;
}

@Injectable()
export class OllamaEmbeddingProvider {
  private readonly base: string;
  private readonly model: string;

  constructor(cfg: ConfigService) {
    this.base  = cfg.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.model = cfg.env.EMBEDDING_MODEL_ID || 'nomic-embed-text';
  }

  async embed(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (const t of texts) {
      const r = await fetch(`${this.base}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt: t }),
      });
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        throw new Error(`Ollama embeddings error: ${r.status} ${r.statusText} ${body}`);
      }
      const j = await r.json();
      const v: number[] = j?.embedding;
      if (!Array.isArray(v) || !v.length) throw new Error('Invalid embedding vector');
      out.push(v);
    }
    return out;
  }
}

