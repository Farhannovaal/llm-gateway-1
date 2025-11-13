import { Injectable } from '@nestjs/common';
import { LlmService, ChatMessage } from '../llm/llm.service';

@Injectable()
export class ChatService {
  constructor(private readonly llm: LlmService) {}

  chat(messages: ChatMessage[]) {
    return this.llm.chat(messages);
  }

  stream(messages: ChatMessage[]) {
    return this.llm.stream(messages);
  }
}
