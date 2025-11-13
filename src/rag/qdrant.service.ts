import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export interface QdrantUpsertPayload {
  id?: string | number;
  vector: number[];
  content: string;
  source: string;
  uri?: string;
  tags?: string[];
  lang?: string;
  title?: string;
}

@Injectable()
export class QdrantService implements OnModuleInit {
  private readonly logger = new Logger(QdrantService.name);

  private readonly baseUrl = process.env.QDRANT_URL || 'http://localhost:6333';
  readonly collection = process.env.QDRANT_COLLECTION || 'kb_chunks';
  private readonly distance: 'Cosine' | 'Dot' | 'Euclid' =
    (process.env.QDRANT_DISTANCE as any) || 'Cosine';

  private dim = Number(process.env.QDRANT_VECTOR_DIM ?? 768);
  private readonly defaultTopK = Number(process.env.RAG_TOP_K ?? 5);
  private readonly defaultMinScore = Number(process.env.RAG_MIN_SCORE ?? 0.3);

  get vectorDim() {
    return this.dim;
  }

  async onModuleInit() {
    for (let i = 1; i <= 10; i++) {
      try {
        const r = await fetch(`${this.baseUrl}/collections`);
        if (r.ok) break;
      } catch (e: any) {
        this.logger.warn(
          `Qdrant not ready (try ${i}/10): ${e?.message || e}`,
        );
      }
      await sleep(1000);
    }

    await this.ensureCollection();
  }

  private async ensureCollection() {
    try {
      const res = await fetch(
        `${this.baseUrl}/collections/${this.collection}`,
      );

      if (res.status === 200) {
        const info = await res.json();
        const size =
          info?.result?.config?.params?.vectors?.size ??
          info?.result?.status?.vectors_count;

        if (size) {
          this.dim = size;
          this.logger.log(
            `Using existing collection: ${this.collection} (dim=${this.dim}, distance=${this.distance})`,
          );
        } else {
          this.logger.log(
            `Using existing collection: ${this.collection} (dim unknown, assume ${this.dim})`,
          );
        }
        return;
      }

      if (res.status !== 404) {
        const body = await res.text().catch(() => '');
        this.logger.warn(
          `Unexpected status getting collection ${this.collection}: ${res.status} ${body}`,
        );
      }

      this.logger.warn(
        `Collection ${this.collection} not found; creating with dim=${this.dim}...`,
      );

      const createRes = await fetch(
        `${this.baseUrl}/collections/${this.collection}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vectors: { size: this.dim, distance: this.distance },
          }),
        },
      );

      if (!createRes.ok) {
        const txt = await createRes.text().catch(() => '');
        throw new Error(
          `Failed to create collection: ${createRes.status} ${createRes.statusText} - ${txt}`,
        );
      }

      this.logger.log(
        `Created collection: ${this.collection} (dim=${this.dim}, distance=${this.distance})`,
      );
    } catch (e: any) {
      this.logger.error(
        `Failed to ensure collection ${this.collection}: ${e?.message || e}`,
      );
    }
  }

  async upsertMany(items: QdrantUpsertPayload[]) {
  if (!items.length) {
    this.logger.warn('upsertMany called with empty items');
    return;
  }

  const nowIso = new Date().toISOString();

  for (const it of items) {
    if (!Array.isArray(it.vector)) {
      throw new Error('Qdrant upsert: vector is not an array');
    }
    if (it.vector.length !== this.dim) {
      throw new Error(
        `Qdrant upsert: vector length ${it.vector.length} != expected dim ${this.dim}`,
      );
    }
  }

  const points = items.map((it, i) => ({
    id: it.id ?? Date.now() + i,
    vector: it.vector,
    payload: {
      content: it.content,
      source: it.source,
      uri: it.uri ?? null,
      tags: it.tags ?? [],
      lang: it.lang ?? null,
      title: it.title ?? null,
      createdAt: nowIso,
    },
  }));

  this.logger.log(
    `Upserting ${points.length} points into ${this.collection} (vectorDim=${points[0].vector.length}, qdrantDim=${this.dim})`,
  );

  const res = await fetch(
    `${this.baseUrl}/collections/${this.collection}/points?wait=true`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points }),
    },
  );

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(
      `Qdrant upsert failed: ${res.status} ${res.statusText} - ${txt}`,
    );
  }

  return res.json().catch(() => ({}));
}

  async search(
    queryVector: number[],
    opts?: {
      topK?: number;
      minScore?: number;
      tags?: string[];
      source?: string;
    },
  ) {
    const must: any[] = [];

    if (opts?.source) {
      must.push({ key: 'source', match: { value: opts.source } });
    }

    if (opts?.tags?.length) {
      for (const t of opts.tags) {
        must.push({ key: 'tags', match: { value: t } });
      }
    }

    const body = {
      vector: queryVector,
      limit: opts?.topK ?? this.defaultTopK,
      with_payload: true,
      with_vector: false,
      score_threshold: opts?.minScore ?? this.defaultMinScore,
      filter: must.length ? { must } : undefined,
    };

    const res = await fetch(
      `${this.baseUrl}/collections/${this.collection}/points/search`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(
        `Qdrant search failed: ${res.status} ${res.statusText} - ${txt}`,
      );
    }

    const json = await res.json();
    const result = json?.result ?? [];

    return result.map((r: any) => ({
      id: r.id,
      score: r.score,
      payload: r.payload,
    }));
  }
}
