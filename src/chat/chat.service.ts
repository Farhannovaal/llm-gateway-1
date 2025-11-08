import { Injectable } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { ChatMessage } from '../llm/types';

@Injectable()
export class ChatService {
  constructor(private llm: LlmService) {}
  chat(messages: ChatMessage[]) { return this.llm.chat(messages); }
  stream(messages: ChatMessage[]) { return this.llm.stream(messages); }
}
