import { Injectable, Logger } from '@nestjs/common';
import { randomUUID, createHash } from 'crypto';
import { QdrantService } from './qdrant.service';
import { OllamaEmbeddingProvider } from '../llm/providers/ollama-embedding.provider';
import { splitRecursive } from './utils/chuncker';

type UpsertInput = {
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
  docId: string;
  source: string;
  uri?: string;
  title?: string;
  lang?: string;
  tags?: string[];
  hash: string;
  content: string;
  tokenCount: number;
  createdAt: string;
};

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);
  private readonly topK = Number(process.env.RAG_TOP_K ?? 5);
  private readonly minScore = Number(process.env.RAG_MIN_SCORE ?? 0.3);

  constructor(
    private readonly qdrant: QdrantService,
    private readonly embedder: OllamaEmbeddingProvider,
  ) {}

  async ingest(input: UpsertInput) {
    const docId = input.docId ?? randomUUID();

    this.logger.log(
      `RAG ingest start: docId=${docId}, source=${input.source}, ` +
        `textLen=${input.text?.length ?? 0}, tags=${JSON.stringify(
          input.tags ?? [],
        )}`,
    );

    const chunks = splitRecursive(input.text);
    this.logger.log(
      `RAG chunking: docId=${docId}, chunks=${chunks.length}, firstChunk="${chunks[0]?.slice(
        0,
        80,
      ) ?? ''}"`,
    );

    if (!chunks.length) {
      throw new Error('No chunks produced from text');
    }

    const hashes = chunks.map((c) =>
      createHash('sha256').update(c).digest('hex'),
    );
    this.logger.debug(
      `RAG hashes: docId=${docId}, hashesCount=${hashes.length}, firstHash=${hashes[0]}`,
    );

    const vectors = await this.embedder.embed(chunks);

    if (!vectors.length) {
      throw new Error('Embedding provider returned empty array');
    }

    const dim = vectors[0].length;

    this.logger.log(
      `RAG embed: docId=${docId}, vectors=${vectors.length}, dim=${dim}, qdrantDim=${this.qdrant.vectorDim}`,
    );

    if (vectors.length !== chunks.length) {
      throw new Error(
        `Embedding count mismatch: got ${vectors.length}, expected ${chunks.length}`,
      );
    }

    if (dim !== this.qdrant.vectorDim) {
      throw new Error(
        `Embedding dim=${dim} does not match Qdrant dim=${this.qdrant.vectorDim}. ` +
          `Set QDRANT_VECTOR_DIM=${dim} dan recreate collection ${this.qdrant.collection}.`,
      );
    }

    try {
      await this.qdrant.upsertMany(
        chunks.map((content, idx) => ({
          vector: vectors[idx],
          content,
          source: input.source,
          uri: input.uri,
          tags: input.tags ?? [],
          lang: input.lang,
          title: input.title,
        })),
      );
    } catch (e: any) {
      this.logger.error(
        `RagService.ingest failed for docId=${docId}: ${e?.message || e}`,
        e?.stack,
      );
      throw e;
    }

    this.logger.log(
      `RAG ingest DONE: docId=${docId}, chunks=${chunks.length} into collection=${this.qdrant.collection}`,
    );

    return { docId, chunks: chunks.length };
  }

  async search(
  query: string,
  filters?: { tags?: string[]; source?: string },
): Promise<RagSearchHit[]> {
  this.logger.log(
    `RAG search query="${query}", tags=${JSON.stringify(filters?.tags)}, source=${filters?.source}`,
  );

  const [qvec] = await this.embedder.embed([query]);

  const res = await this.qdrant.search(qvec, {
    topK: this.topK,
    minScore: this.minScore,
    tags: filters?.tags,
    source: filters?.source,
  });

  this.logger.log(`RAG search hits=${res.length}`);

  return res.map((r: any) => ({
    score: r.score,
    ...(r.payload ?? {}),
  })) as RagSearchHit[];
}
}
