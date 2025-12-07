export type UpsertInput = {
  docId?: string;
  source: string;
  uri?: string;
  title?: string;
  lang?: string;
  tags?: string[];
  text: string;
};

export type RagSearchHit = {
  score: number;
  id?: string | number;
  docId?: string | null;
  source: string;
  uri?: string | null;
  title?: string | null;
  lang?: string | null;
  tags?: string[];
  hash?: string | null;
  content: string;
  tokenCount?: number | null;
  createdAt?: string | null;
};