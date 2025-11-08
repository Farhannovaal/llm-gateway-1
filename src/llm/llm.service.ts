import { Injectable } from '@nestjs/common';
import { ConfigService } from '../common/config.service';
import { LlmClient, ChatMessage } from './types';
import { OllamaClient } from './providers/ollama.provider';

@Injectable()
export class LlmService {
  private client: LlmClient;
  constructor(private cfg: ConfigService) {
    const env = cfg.env;
    if (env.LLM_PROVIDER === 'ollama') {
      this.client = new OllamaClient(env.OLLAMA_BASE_URL, env.MODEL_ID);
    } else {
      throw new Error(`Unsupported LLM_PROVIDER: ${env.LLM_PROVIDER}`);
    }
  }
  chat(messages: ChatMessage[]) { return this.client.chat(messages); }
  stream(messages: ChatMessage[]) { return this.client.stream(messages); }
}
