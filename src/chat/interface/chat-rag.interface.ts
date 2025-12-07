export type RagMode = 'auto' | 'rag-only' | 'llm-only';

export interface ChatRagOptions {
  tags?: string[];
  mode?: RagMode;
  historyText?: string | null;
}

export interface ChatRagAnswer {
  text: string;
  references: { idx: number; source: string; uri: string | null }[];
  mode: RagMode;
  usedRag: boolean;
  hitsCount: number;
}

export interface ChatRagStreamResult {
  stream: AsyncIterable<string>;
  references: { idx: number; source: string; uri: string | null }[];
  mode: RagMode;
  usedRag: boolean;
  hitsCount: number;
}