import { Injectable, Logger } from '@nestjs/common';
import { randomUUID, createHash } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { OllamaEmbeddingProvider } from '../llm/providers/ollama-embedding.provider';
import { splitRecursive } from './utils/chuncker';
import { KbDocument } from '../kb/kb-document.entity';
import { CHAT_DB_CONNECTION } from '../chat-db/chat-db.module';
import { UpsertInput, RagSearchHit } from './interfaces/rag.interfaces';
import {
  estimateTokenCount,
  preprocessText,
} from './utils/rag-text';
import { QdrantRagRepository } from './repository/qdrant-rag.repository';

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  private readonly searchTopK = Number(process.env.RAG_SEARCH_TOP_K ?? 32);
  private readonly minScore = Number(process.env.RAG_MIN_SCORE ?? 0.3);
  private readonly reindexBatchSize = Number(
    process.env.RAG_REINDEX_BATCH ?? 32,
  );

  private readonly embedBatchSize = Number(
    process.env.RAG_EMBED_BATCH_SIZE ?? 32,
  );

  private readonly maxChunksPerDoc = Number(
    process.env.RAG_MAX_CHUNKS_PER_DOC ?? 200,
  );

  constructor(
    private readonly qdrantRepo: QdrantRagRepository,
    private readonly embedder: OllamaEmbeddingProvider,

    @InjectRepository(KbDocument, CHAT_DB_CONNECTION)
    private readonly kbRepo: Repository<KbDocument>,
  ) {}

  // ============================================================
  // PUBLIC API
  // ============================================================

  async ingest(input: UpsertInput) {
    const rawText = input.text ?? '';
    const hasDocId = Boolean(input.docId);

    const textForIndex = preprocessText(input, this.logger);

    this.logger.log(
      `RAG ingest start: docId=${input.docId ?? '(new)'}, source=${
        input.source
      }, rawLen=${rawText.length}, indexedLen=${
        textForIndex.length
      }, tags=${JSON.stringify(input.tags ?? [])}`,
    );

    const chunks = splitRecursive(textForIndex);
    this.logger.log(
      `RAG chunking: docId=${input.docId ?? '(new)'}, chunks=${
        chunks.length
      }, firstChunk="${chunks[0]?.slice(0, 80) ?? ''}"`,
    );

    if (!chunks.length) {
      throw new Error('No chunks produced from text');
    }

    if (hasDocId) {
      return this.ingestAsSingleDocument(
        input.docId as string,
        input,
        textForIndex,
        chunks,
      );
    }

    if (chunks.length > this.maxChunksPerDoc) {
      return this.ingestAsMultipleDocuments(input, textForIndex, chunks);
    }

    const newDocId = randomUUID();
    return this.ingestAsSingleDocument(newDocId, input, textForIndex, chunks);
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

    const res = await this.qdrantRepo.search(qvec, {
      topK: this.searchTopK,
      minScore: this.minScore,
      tags: filters?.tags,
      source: filters?.source,
    });

    this.logger.log(`RAG search hits=${res.length}`);

    return res.map((r: any) => this.mapSearchResultToHit(r, filters));
  }

  async getDocumentById(id: string) {
    this.logger.log(`getDocumentById (chunk) id=${id}`);
    const p = await this.qdrantRepo.getPoint(id);
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

    const existing = await this.qdrantRepo.getPoint(pointId);
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
      tokenCount: estimateTokenCount(newContent),
      hash: createHash('sha256').update(newContent).digest('hex'),
    };

    await this.qdrantRepo.upsertMany([
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

    await this.qdrantRepo.deleteBySource(source);
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

    return this.qdrantRepo.deletePoints([normalizedId]);
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
            payload.tokenCount ?? estimateTokenCount(content ?? ''),
        };
      });

      await this.qdrantRepo.upsertMany(upserts);

      processed += upserts.length;
      if (progressCb) progressCb({ processed });

      batchContents.length = 0;
      batchPoints.length = 0;
    };

    for await (const p of this.qdrantRepo.iteratePoints({
      source: source ?? undefined,
      batchSize,
    })) {
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

    await this.qdrantRepo.deleteByDocId(id);
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

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  private mapSearchResultToHit(
    r: any,
    filters?: { source?: string },
  ): RagSearchHit {
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
    };
  }

  private async embedChunks(
    chunks: string[],
    logId: string,
  ): Promise<number[][]> {
    const vectors: number[][] = [];
    const batchSize = Math.max(1, this.embedBatchSize);

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      this.logger.log(
        `RAG embed batch: id=${logId}, batch=${i / batchSize + 1}, size=${
          batch.length
        }`,
      );

      const v = await this.embedder.embed(batch);

      if (!v || v.length !== batch.length) {
        throw new Error(
          `Embedding provider returned ${v?.length ?? 0} vectors for batch of ${
            batch.length
          } chunks (id=${logId})`,
        );
      }

      vectors.push(...v);
    }

    return vectors;
  }

  private validateEmbeddingDim(vectors: number[][], contextId: string) {
    if (!vectors.length) {
      throw new Error(
        `No vectors produced for contextId=${contextId}`,
      );
    }

    const dim = vectors[0].length;
    this.logger.log(
      `RAG embed: contextId=${contextId}, vectors=${vectors.length}, dim=${dim}, qdrantDim=${this.qdrantRepo.vectorDim}`,
    );

    if (dim !== this.qdrantRepo.vectorDim) {
      throw new Error(
        `Embedding dim=${dim} does not match Qdrant dim=${this.qdrantRepo.vectorDim}. ` +
          `Set QDRANT_VECTOR_DIM=${dim} dan recreate collection ${this.qdrantRepo.collection}.`,
      );
    }
  }

  private async ingestAsSingleDocument(
    docId: string,
    input: UpsertInput,
    textForIndex: string,
    chunks: string[],
  ) {
    const textHash = createHash('sha256').update(textForIndex).digest('hex');

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
        text: textForIndex,
        hash: textHash,
      });
    } else {
      doc.source = input.source;
      doc.uri = input.uri ?? null;
      doc.title = input.title ?? null;
      doc.lang = input.lang ?? null;
      doc.tags = input.tags ?? [];
      doc.text = textForIndex;
      doc.hash = textHash;
    }

    await this.kbRepo.save(doc);

    if (isUpdate) {
      try {
        await this.qdrantRepo.deleteByDocId(docId);
      } catch (e: any) {
        this.logger.error(
          `Failed to delete old chunks for docId=${docId}: ${e?.message || e}`,
        );
        throw e;
      }
    }

    const hashes = chunks.map((c) =>
      createHash('sha256').update(c).digest('hex'),
    );
    const tokenCounts = chunks.map((c) => estimateTokenCount(c));

    this.logger.debug(
      `RAG hashes: docId=${docId}, hashesCount=${hashes.length}, firstHash=${hashes[0]}`,
    );

    const vectors = await this.embedChunks(chunks, docId);

    if (!vectors.length || vectors.length !== chunks.length) {
      throw new Error(
        `Total vectors=${vectors.length} does not match chunks=${chunks.length} for docId=${docId}`,
      );
    }

    this.validateEmbeddingDim(vectors, docId);

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

      await this.qdrantRepo.upsertMany(upserts);
    } catch (e: any) {
      this.logger.error(
        `RagService.ingest failed for docId=${docId}: ${e?.message || e}`,
        e?.stack,
      );
      throw e;
    }

    this.logger.log(
      `RAG ingest DONE (single): docId=${docId}, chunks=${chunks.length} into collection=${this.qdrantRepo.collection}`,
    );

    return { docId, chunks: chunks.length };
  }

  private async ingestAsMultipleDocuments(
    input: UpsertInput,
    textForIndex: string,
    chunks: string[],
  ) {
    const groupId = randomUUID();
    const totalChunks = chunks.length;
    const totalParts = Math.ceil(totalChunks / this.maxChunksPerDoc);

    this.logger.log(
      `RAG ingest multi-doc: groupId=${groupId}, source=${input.source}, chunks=${totalChunks}, parts=${totalParts}`,
    );

    const groupTag = `kb-group:${groupId}`;

    const hashes = chunks.map((c) =>
      createHash('sha256').update(c).digest('hex'),
    );
    const tokenCounts = chunks.map((c) => estimateTokenCount(c));

    const vectors = await this.embedChunks(chunks, groupId);

    if (!vectors.length || vectors.length !== chunks.length) {
      throw new Error(
        `Total vectors=${vectors.length} does not match chunks=${chunks.length} for groupId=${groupId}`,
      );
    }

    this.validateEmbeddingDim(vectors, groupId);

    const allUpserts: any[] = [];

    for (let partIndex = 0; partIndex < totalParts; partIndex++) {
      const start = partIndex * this.maxChunksPerDoc;
      const end = Math.min(start + this.maxChunksPerDoc, totalChunks);

      const partChunks = chunks.slice(start, end);
      const partVectors = vectors.slice(start, end);
      const partHashes = hashes.slice(start, end);
      const partTokenCounts = tokenCounts.slice(start, end);

      const partDocId = randomUUID();
      const partText = partChunks.join('\n\n');
      const partHash = createHash('sha256').update(partText).digest('hex');
      const partTitleBase = input.title ?? 'Untitled';
      const partTitle =
        totalParts > 1
          ? `${partTitleBase} (bagian ${partIndex + 1}/${totalParts})`
          : partTitleBase;

      const partTags = [
        ...(input.tags ?? []),
        groupTag,
        `kb-part:${partIndex + 1}/${totalParts}`,
      ];

      const kbDoc = this.kbRepo.create({
        id: partDocId,
        source: input.source,
        uri: input.uri ?? null,
        title: partTitle,
        lang: input.lang ?? null,
        tags: partTags,
        text: partText,
        hash: partHash,
      });

      await this.kbRepo.save(kbDoc);

      this.logger.log(
        `RAG ingest multi-doc: saved KbDocument partDocId=${partDocId}, ` +
          `part=${partIndex + 1}/${totalParts}, chunks=${partChunks.length}`,
      );

      for (let i = 0; i < partChunks.length; i++) {
        allUpserts.push({
          vector: partVectors[i],
          content: partChunks[i],
          source: input.source,
          uri: input.uri ?? undefined,
          tags: partTags,
          lang: input.lang ?? undefined,
          title: partTitle,
          docId: partDocId,
          hash: partHashes[i],
          tokenCount: partTokenCounts[i],
        });
      }
    }

    try {
      await this.qdrantRepo.upsertMany(allUpserts);
    } catch (e: any) {
      this.logger.error(
        `RagService.ingest (multi) failed for groupId=${groupId}: ${
          e?.message || e
        }`,
        e?.stack,
      );
      throw e;
    }

    this.logger.log(
      `RAG ingest DONE (multi): groupId=${groupId}, parts=${totalParts}, chunks=${totalChunks} into collection=${this.qdrantRepo.collection}`,
    );

    return { docId: groupId, chunks: totalChunks };
  }
}
