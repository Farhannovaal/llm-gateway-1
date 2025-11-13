import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { RequestInit } from 'undici'; 
import { ConfigService } from '../common/config.service';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  private readonly base: string;
  private readonly chatModel: string;
  private readonly embedModel: string;

  constructor(private readonly cfg: ConfigService) {
    const env = this.cfg.env;

    this.base = env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.chatModel = env.MODEL_ID || 'qwen2.5:3b-instruct';
    this.embedModel = env.EMBEDDING_MODEL_ID || 'nomic-embed-text';
  }

  private async fetchJSON<T = any>(
    path: string,
    init?: RequestInit,
  ): Promise<T> {
    const url = `${this.base}${path}`;
    const res = await fetch(url, init as any);
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${res.statusText} - ${txt}`);
    }
    return (res.json() as Promise<T>);
  }

  async embed(texts: string[]): Promise<number[][]> {
    try {
      const body = { model: this.embedModel, input: texts };
      const data = await this.fetchJSON<{ embeddings: number[][] }>(
        '/api/embeddings',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      return data.embeddings;
    } catch (e: any) {
      this.logger.error('embedding failed', e?.stack || e);
      throw new HttpException(
        `Embedding unavailable: ${e?.message || e}`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async chat(messages: ChatMessage[]): Promise<{ text: string }> {
    const body = { model: this.chatModel, messages, stream: false };
    const data = await this.fetchJSON<{
      message?: { content: string };
      response?: string;
    }>('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const text = data?.message?.content ?? (data as any)?.response ?? '';
    return { text: String(text ?? '') };
  }

  async stream(
    messages: ChatMessage[],
  ): Promise<AsyncIterable<string>> {
    const body = { model: this.chatModel, messages, stream: true };

    const url = `${this.base}/api/chat`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    } as any);

    if (!res.ok || !res.body) {
      const txt = await res.text().catch(() => '');
      throw new Error(
        `HTTP ${res.status} ${res.statusText} (stream) - ${txt}`,
      );
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    async function* iter() {
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Ollama stream: satu JSON per baris
        for (;;) {
          const idx = buffer.indexOf('\n');
          if (idx === -1) break;

          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);

          if (!line) continue;

          try {
            const json = JSON.parse(line);
            const chunk =
              json?.message?.content ??
              json?.response ??
              json?.content ??
              '';
            if (chunk) {
              yield String(chunk);
            }
          } catch {
          }
        }
      }
    }

    return iter();
  }
}
