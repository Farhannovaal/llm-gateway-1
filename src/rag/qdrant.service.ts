import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto'; 

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
  docId?: string;
  hash?: string;
  tokenCount?: number;
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

  get url() {
    return this.baseUrl;
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
        const info = await res.json().catch(() => null);
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

  const normalizeId = (id: string | number | undefined, idx: number) => {
    if (typeof id === 'number') return id;
    if (typeof id === 'string') {
      const digitsOnly = /^[0-9]+$/;
      if (digitsOnly.test(id)) {
        return Number(id);
      }
      return id;
    }
    return randomUUID();
  };

  const points = items.map((it, i) => {
    const rawId = (it as any).id;
    const id = normalizeId(rawId, i);

    return {
      id,
      vector: it.vector,
      payload: {
        content: it.content,
        source: it.source,
        uri: it.uri ?? undefined,
        tags: it.tags ?? [],
        lang: it.lang ?? undefined,
        title: it.title ?? undefined,
        createdAt: nowIso,
        docId: it.docId ?? undefined,
        hash: it.hash ?? undefined,
        tokenCount: it.tokenCount ?? undefined,
      },
    };
  });

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

    const body: any = {
      vector: queryVector,
      limit: opts?.topK ?? this.defaultTopK,
      with_payload: true,
      with_vector: false,
      score_threshold: opts?.minScore ?? this.defaultMinScore,
    };

    if (must.length) body.filter = { must };

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

  async debugBySource(source: string, limit = 20) {
    const body = {
      filter: {
        must: [{ key: 'source', match: { value: source } }],
      },
      with_payload: true,
      with_vector: false,
      limit,
    };

    const res = await fetch(
      `${this.baseUrl}/collections/${this.collection}/points/scroll`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(
        `Qdrant debug scroll failed: ${res.status} ${res.statusText} - ${txt}`,
      );
    }

    return res.json();
  }

  async getPoint(id: string) {
    const res = await fetch(
      `${this.baseUrl}/collections/${this.collection}/points/${encodeURIComponent(
        id,
      )}`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      },
    );

    if (res.status === 404) return null;

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(
        `Qdrant getPoint failed: ${res.status} ${res.statusText} - ${txt}`,
      );
    }

    const json = await res.json();
    return json?.result ?? null;
  }

  async *iteratePoints(opts?: { source?: string; batchSize?: number }) {
    const batchSize = opts?.batchSize ?? 100;
    const filterMust: any[] = [];

    if (opts?.source) {
      filterMust.push({ key: 'source', match: { value: opts.source } });
    }

    const requestBody: any = {
      limit: batchSize,
      with_payload: true,
      with_vector: false,
    };

    if (filterMust.length) requestBody.filter = { must: filterMust };

    let hasMore = true;
    let offset = 0;
    while (hasMore) {
      const body = { ...requestBody, offset };
      const res = await fetch(
        `${this.baseUrl}/collections/${this.collection}/points/scroll`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(
          `Qdrant scroll failed: ${res.status} ${res.statusText} - ${txt}`,
        );
      }

      const j = await res.json();
      const pts: any[] = j?.result ?? j?.points ?? [];

      if (!Array.isArray(pts) || !pts.length) {
        break;
      }

      for (const p of pts) {
        yield p;
      }

      const returned = pts.length;
      offset += returned;
      if (returned < batchSize) hasMore = false;
    }
  }

  async deletePoints(ids: Array<string | number>) {
    if (!ids?.length) {
      return { ok: true };
    }

    const normalized = ids.map((id) => {
      if (typeof id === 'number') return id;
      if (/^[0-9]+$/.test(id)) {
        return Number(id);
      }
      return id; // anggap UUID string
    });

    const body = { points: normalized };

    const res = await fetch(
      `${this.baseUrl}/collections/${this.collection}/points/delete`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(
        `Qdrant deletePoints failed: ${res.status} ${res.statusText} - ${txt}`,
      );
    }

    return res.json();
  }

  async deleteBySource(source: string) {
    if (!source) throw new Error('source is required');

    const body = {
      filter: {
        must: [{ key: 'source', match: { value: source } }],
      },
    };

    const res = await fetch(
      `${this.baseUrl}/collections/${this.collection}/points/delete`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(
        `Qdrant deleteBySource failed: ${res.status} ${res.statusText} - ${txt}`,
      );
    }

    return res.json();
  }
}
