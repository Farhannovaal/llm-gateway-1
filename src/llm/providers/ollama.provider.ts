import { LlmClient, ChatMessage, ChatOptions } from '../types';

export class OllamaClient implements LlmClient {
  constructor(
    private base = process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    private model = process.env.MODEL_ID || 'qwen2.5:3b-instruct',
  ) {}

  async chat(messages: ChatMessage[], opts?: ChatOptions) {
    const r = await fetch(`${this.base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
        options: {
          temperature: opts?.temperature ?? 0.2,
        },
      }),
    });

    if (!r.ok) {
      const body = await r.text().catch(() => '');
      throw new Error(`Ollama chat error: ${r.status} ${r.statusText} ${body}`);
    }

    const j = await r.json();
    const text = j?.message?.content ?? '';
    return { text };
  }

  async stream(messages: ChatMessage[], opts?: ChatOptions): Promise<AsyncIterable<string>> {
    const r = await fetch(`${this.base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: true,
        options: {
          temperature: opts?.temperature ?? 0.2,
        },
      }),
    });

    if (!r.ok || !r.body) {
      const body = await r.text().catch(() => '');
      throw new Error(`Ollama stream error: ${r.status} ${r.statusText} ${body}`);
    }

    const reader = r.body.getReader();
    const dec = new TextDecoder();

    async function* gen() {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        yield dec.decode(value, { stream: true });
      }
    }

    return gen();
  }
}
