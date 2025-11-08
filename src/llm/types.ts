export type ChatMessage = { role: 'system'|'user'|'assistant'; content: string };
export type ChatOptions = { temperature?: number };
export interface LlmClient {
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<{ text: string }>;
  stream(messages: ChatMessage[], opts?: ChatOptions): Promise<AsyncIterable<string>>;
}
