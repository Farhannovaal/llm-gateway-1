import { Injectable, Logger } from '@nestjs/common';
import { randomUUID, createHash } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { QdrantService } from './qdrant.service';
import { OllamaEmbeddingProvider } from '../llm/providers/ollama-embedding.provider';
import { splitRecursive } from './utils/chuncker';
import { KbDocument } from '../kb/kb-document.entity';
import { CHAT_DB_CONNECTION } from '../chat-db/chat-db.module';

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

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  private readonly topK = Number(process.env.RAG_TOP_K ?? 5);
  private readonly minScore = Number(process.env.RAG_MIN_SCORE ?? 0.3);
  private readonly reindexBatchSize = Number(
    process.env.RAG_REINDEX_BATCH ?? 32,
  );

  constructor(
    private readonly qdrant: QdrantService,
    private readonly embedder: OllamaEmbeddingProvider,

    @InjectRepository(KbDocument, CHAT_DB_CONNECTION)
    private readonly kbRepo: Repository<KbDocument>,
  ) {}

  private estimateTokenCount(text: string): number {
    if (!text) return 0;
    const words = text.trim().split(/\s+/g).length;
    return Math.ceil(words * 1.3);
  }

  private async deleteChunksByDocId(docId: string) {
    this.logger.log(`deleteChunksByDocId docId=${docId}`);

    const body = {
      filter: {
        must: [{ key: 'docId', match: { value: docId } }],
      },
    };

    const res = await fetch(
      `${this.qdrant.url}/collections/${this.qdrant.collection}/points/delete`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(
        `Failed to delete chunks by docId=${docId}: ${txt || res.statusText}`,
      );
    }
  }

  async ingest(input: UpsertInput) {
    const rawText = input.text ?? '';
    const docId = input.docId ?? randomUUID();

    this.logger.log(
      `RAG ingest start: docId=${docId}, source=${input.source}, ` +
        `textLen=${rawText.length}, tags=${JSON.stringify(input.tags ?? [])}`,
    );

    const textHash = createHash('sha256').update(rawText).digest('hex');

    let doc = await this.kbRepo.findOne({ where: { id: docId } });
    const isUpdate = Boolean(doc);

    if (!doc) {
      doc = this.kbRepo.create({
        id: docId,
        source: input.source,
        uri: input.uri ?? null,
        title: input.title ?? null,
        lang: input.lang ?? null,
        tags: input.tags ?? [],
        text: rawText,
        hash: textHash,
      });
    } else {
      doc.source = input.source;
      doc.uri = input.uri ?? null;
      doc.title = input.title ?? null;
      doc.lang = input.lang ?? null;
      doc.tags = input.tags ?? [];
      doc.text = rawText;
      doc.hash = textHash;
    }

    await this.kbRepo.save(doc);

    if (isUpdate) {
      try {
        await this.deleteChunksByDocId(docId);
      } catch (e: any) {
        this.logger.error(
          `Failed to delete old chunks for docId=${docId}: ${e?.message || e}`,
        );
        throw e;
      }
    }

    const chunks = splitRecursive(rawText);
    this.logger.log(
      `RAG chunking: docId=${docId}, chunks=${chunks.length}, firstChunk="${
        chunks[0]?.slice(0, 80) ?? ''
      }"`,
    );

    if (!chunks.length) {
      throw new Error('No chunks produced from text');
    }

    const hashes = chunks.map((c) =>
      createHash('sha256').update(c).digest('hex'),
    );
    const tokenCounts = chunks.map((c) => this.estimateTokenCount(c));

    this.logger.debug(
      `RAG hashes: docId=${docId}, hashesCount=${hashes.length}, firstHash=${hashes[0]}`,
    );

    const vectors = await this.embedder.embed(chunks);

    if (!vectors || vectors.length !== chunks.length) {
      throw new Error(
        `Embedding provider returned ${vectors?.length ?? 0}, expected ${
          chunks.length
        }`,
      );
    }

    const dim = vectors[0].length;
    this.logger.log(
      `RAG embed: docId=${docId}, vectors=${vectors.length}, dim=${dim}, qdrantDim=${this.qdrant.vectorDim}`,
    );

    if (dim !== this.qdrant.vectorDim) {
      throw new Error(
        `Embedding dim=${dim} does not match Qdrant dim=${this.qdrant.vectorDim}. ` +
          `Set QDRANT_VECTOR_DIM=${dim} dan recreate collection ${this.qdrant.collection}.`,
      );
    }

    try {
      const upserts = chunks.map((content, idx) => ({
        vector: vectors[idx],
        content,
        source: input.source,
        uri: input.uri ?? undefined,
        tags: input.tags ?? [],
        lang: input.lang ?? undefined,
        title: input.title ?? undefined,
        docId,
        hash: hashes[idx],
        tokenCount: tokenCounts[idx],
      }));

      await this.qdrant.upsertMany(upserts);
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
      `RAG search query="${query}", tags=${JSON.stringify(
        filters?.tags,
      )}, source=${filters?.source}`,
    );

    const [qvec] = await this.embedder.embed([query]);

    const res = await this.qdrant.search(qvec, {
      topK: this.topK,
      minScore: this.minScore,
      tags: filters?.tags,
      source: filters?.source,
    });

    this.logger.log(`RAG search hits=${res.length}`);

    return res.map((r: any) => {
      const payload = r.payload ?? {};
      return {
        score: r.score,
        id: r.id,
        docId: payload.docId ?? null,
        source: payload.source ?? filters?.source ?? 'unknown',
        uri: payload.uri ?? null,
        title: payload.title ?? null,
        lang: payload.lang ?? null,
        tags: payload.tags ?? [],
        hash: payload.hash ?? null,
        content: payload.content ?? '',
        tokenCount: payload.tokenCount ?? null,
        createdAt: payload.createdAt ?? null,
      } as RagSearchHit;
    });
  }

  async getDocumentById(id: string) {
    this.logger.log(`getDocumentById (chunk) id=${id}`);
    const p = await this.qdrant.getPoint(id);
    if (!p) return null;

    const payload = p.payload ?? p;

    return {
      id: p.id ?? id,
      content: payload.content ?? payload.text ?? '',
      title: payload.title ?? null,
      tags: payload.tags ?? [],
      source: payload.source ?? null,
      uri: payload.uri ?? null,
      lang: payload.lang ?? null,
      tokenCount: payload.tokenCount ?? null,
      docId: payload.docId ?? null,
      hash: payload.hash ?? null,
      createdAt: payload.createdAt ?? null,
    };
  }

  async updateChunk(
    pointId: string,
    newContent: string,
    opts?: { title?: string; tags?: string[] },
  ) {
    this.logger.log(`updateChunk pointId=${pointId}`);

    const existing = await this.qdrant.getPoint(pointId);
    if (!existing) {
      throw new Error('point not found');
    }
    const payload = existing.payload ?? {};

    const vectors = await this.embedder.embed([newContent]);
    if (!vectors || !vectors.length) {
      throw new Error(
        'Embedding provider returned empty vector for updated content',
      );
    }
    const vector = vectors[0];

    const updatedPayload = {
      ...payload,
      content: newContent,
      title: opts?.title ?? payload.title ?? undefined,
      tags: opts?.tags ?? payload.tags ?? [],
      tokenCount: this.estimateTokenCount(newContent),
      hash: createHash('sha256').update(newContent).digest('hex'),
    };

    await this.qdrant.upsertMany([
      {
        id: pointId,
        vector,
        content: newContent,
        source: updatedPayload.source ?? payload.source ?? 'unknown',
        uri: updatedPayload.uri ?? payload.uri ?? undefined,
        tags: updatedPayload.tags ?? [],
        lang: updatedPayload.lang ?? payload.lang ?? undefined,
        title: updatedPayload.title ?? undefined,
        docId: updatedPayload.docId ?? payload.docId ?? undefined,
        hash: updatedPayload.hash,
        tokenCount: updatedPayload.tokenCount,
      },
    ]);

    return { id: pointId };
  }

  async deleteBySource(source: string) {
    this.logger.log(`deleteBySource source=${source}`);
    if (!source) throw new Error('source is required');

    if (typeof (this.qdrant as any).deleteBySource === 'function') {
      await (this.qdrant as any).deleteBySource(source);
    } else {
      const body = {
        filter: {
          must: [{ key: 'source', match: { value: source } }],
        },
      };

      const res = await fetch(
        `${this.qdrant.url}/collections/${this.qdrant.collection}/points/delete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Failed to delete docs by source: ${txt}`);
      }
    }

    await this.kbRepo.delete({ source });

    return { ok: true };
  }

  async deleteOne(id: string | number) {
    this.logger.log(`deleteOne id=${id}`);

    if (id === undefined || id === null || id === '') {
      throw new Error('id is required');
    }

    const normalizedId: string | number =
      typeof id === 'number'
        ? id
        : /^\d+$/.test(id as string)
        ? Number(id)
        : (id as string);

    if (typeof (this.qdrant as any).deletePoints === 'function') {
      return await (this.qdrant as any).deletePoints([normalizedId]);
    }

    const body = { points: [normalizedId] };

    const res = await fetch(
      `${this.qdrant.url}/collections/${this.qdrant.collection}/points/delete`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`Failed to delete chunk: ${t}`);
    }

    return { ok: true };
  }

  async listDocuments(params: {
    source?: string;
    limit?: number;
    offset?: number;
  }) {
    const limit = params.limit && params.limit > 0 ? params.limit : 50;
    const offset = params.offset && params.offset >= 0 ? params.offset : 0;

    const qb = this.kbRepo.createQueryBuilder('d');

    if (params.source) {
      qb.where('d.source = :source', { source: params.source });
    }

    qb.orderBy('d.createdAt', 'DESC').take(limit).skip(offset);

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      total,
      limit,
      offset,
    };
  }

  async reindexAll(
    source?: string | null,
    progressCb?: (progress: { processed: number; total?: number }) => void,
  ) {
    this.logger.log(`reindexAll source=${source ?? '(all)'}`);

    const batchSize = Math.max(1, this.reindexBatchSize);
    let processed = 0;

    const iter =
      typeof (this.qdrant as any).iteratePoints === 'function'
        ? (this.qdrant as any).iteratePoints({
            source: source ?? undefined,
            batchSize,
          })
        : null;

    const batchContents: string[] = [];
    const batchPoints: any[] = [];

    const flushBatch = async () => {
      if (!batchContents.length) return;
      let vectors: number[][];
      try {
        vectors = await this.embedder.embed(batchContents);
      } catch (e: any) {
        this.logger.error(
          'Embedding failed during reindex: ' + (e?.message || String(e)),
        );
        batchContents.length = 0;
        batchPoints.length = 0;
        return;
      }

      const upserts = batchPoints.map((p: any, idx: number) => {
        const payload = p.payload ?? {};
        const content = payload.content ?? '';
        return {
          id: p.id,
          vector: vectors[idx],
          content,
          source: payload.source ?? undefined,
          uri: payload.uri ?? undefined,
          tags: payload.tags ?? [],
          lang: payload.lang ?? undefined,
          title: payload.title ?? undefined,
          docId: payload.docId ?? undefined,
          hash:
            payload.hash ??
            createHash('sha256').update(content).digest('hex'),
          tokenCount:
            payload.tokenCount ?? this.estimateTokenCount(content ?? ''),
        };
      });

      await this.qdrant.upsertMany(upserts);

      processed += upserts.length;
      if (progressCb) progressCb({ processed });

      batchContents.length = 0;
      batchPoints.length = 0;
    };

    if (iter && typeof (iter as any)[Symbol.asyncIterator] === 'function') {
      // path: QdrantService menyediakan iteratePoints
      for await (const p of iter as AsyncIterable<any>) {
        const payload = p.payload ?? {};
        const content = payload.content ?? '';
        if (!content) {
          processed++;
          if (progressCb) progressCb({ processed });
          continue;
        }

        batchPoints.push(p);
        batchContents.push(content);

        if (batchContents.length >= batchSize) {
          await flushBatch();
        }
      }
    } else {
      const pageSize = batchSize;
      let offset = 0;
      while (true) {
        const scrollBody: any = {
          limit: pageSize,
          offset,
          with_payload: true,
          with_vector: false,
        };
        if (source) {
          scrollBody.filter = {
            must: [{ key: 'source', match: { value: source } }],
          };
        }

        const res = await fetch(
          `${this.qdrant.url}/collections/${this.qdrant.collection}/points/scroll`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(scrollBody),
          },
        );

        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          throw new Error(
            `Qdrant scroll failed during reindex: ${txt || res.statusText}`,
          );
        }

        const j = await res.json();
        const pts: any[] = j?.result?.points ?? j?.result ?? j?.points ?? [];
        if (!pts.length) break;

        for (const p of pts) {
          const payload = p.payload ?? {};
          const content = payload.content ?? '';
          if (!content) {
            processed++;
            if (progressCb) progressCb({ processed });
            continue;
          }
          batchPoints.push(p);
          batchContents.push(content);

          if (batchContents.length >= batchSize) {
            await flushBatch();
          }
        }

        offset += pts.length;
        if (pts.length < pageSize) break;
      }
    }

    await flushBatch();

    this.logger.log(`reindexAll finished processed=${processed}`);
    return { ok: true, processed };
  }

  async getKbDocument(id: string) {
    if (!id) throw new Error('id is required');
    return this.kbRepo.findOne({ where: { id } });
  }

  async deleteDocumentById(id: string) {
    if (!id) throw new Error('id is required');

    await this.deleteChunksByDocId(id);

    await this.kbRepo.delete({ id });

    return { ok: true };
  }

  async listSourcesFromDocuments() {
    const qb = this.kbRepo
      .createQueryBuilder('d')
      .select('d.source', 'source')
      .addSelect('COUNT(*)', 'totalDocs')
      .addSelect('MAX(d.updatedAt)', 'lastUpdated')
      .groupBy('d.source')
      .orderBy('totalDocs', 'DESC');

    const rows = await qb.getRawMany();

    return rows.map((r) => ({
      source: r.source,
      totalDocs: Number(r.totalDocs ?? 0),
      lastUpdated: r.lastUpdated,
    }));
  }

}
