import { Injectable, Logger } from '@nestjs/common';
import { QdrantService } from '../qdrant.service';

interface DeleteFilter {
  key: string;
  value: string;
}

interface IteratePointsOptions {
  source?: string;
  batchSize: number;
}

@Injectable()
export class QdrantRagRepository {
  private readonly logger = new Logger(QdrantRagRepository.name);

  constructor(private readonly qdrant: QdrantService) {}


  get vectorDim() {
    return this.qdrant.vectorDim;
  }

  get collection() {
    return this.qdrant.collection;
  }

  get url() {
    return this.qdrant.url;
  }

  async upsertMany(points: any[]) {
    return this.qdrant.upsertMany(points);
  }

  async search(vector: number[], options: any) {
    return this.qdrant.search(vector, options);
  }

  async getPoint(id: string) {
  return this.qdrant.getPoint(id);
}

  async deleteByDocId(docId: string): Promise<void> {
    this.logger.log(`deleteByDocId docId=${docId}`);
    await this.deleteByFilter({ key: 'docId', value: docId });
  }

  async deleteBySource(source: string): Promise<void> {
    this.logger.log(`deleteBySource source=${source}`);

    if (typeof (this.qdrant as any).deleteBySource === 'function') {
      await (this.qdrant as any).deleteBySource(source);
      return;
    }

    await this.deleteByFilter({ key: 'source', value: source });
  }

  async deletePoints(ids: (string | number)[]): Promise<any> {
    this.logger.log(`deletePoints ids=${ids.join(', ')}`);

    if (typeof (this.qdrant as any).deletePoints === 'function') {
      return (this.qdrant as any).deletePoints(ids);
    }

    const body = { points: ids };

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
      throw new Error(`Failed to delete points: ${t || res.statusText}`);
    }

    return { ok: true };
  }

  private async deleteByFilter(filter: DeleteFilter): Promise<void> {
    const body = {
      filter: {
        must: [{ key: filter.key, match: { value: filter.value } }],
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
        `Failed to delete docs by filter ${filter.key}=${filter.value}: ${
          txt || res.statusText
        }`,
      );
    }
  }

  async *iteratePoints(
    options: IteratePointsOptions,
  ): AsyncIterable<any> {
    const { source, batchSize } = options;

    if (typeof (this.qdrant as any).iteratePoints === 'function') {
      const iter = (this.qdrant as any).iteratePoints({
        source,
        batchSize,
      });

      if (iter && typeof iter[Symbol.asyncIterator] === 'function') {
        for await (const p of iter as AsyncIterable<any>) {
          yield p;
        }
        return;
      }
    }

    this.logger.log(
      `iteratePoints fallback scroll: source=${source ?? '(all)'}, batchSize=${batchSize}`,
    );

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
          `Qdrant scroll failed: ${txt || res.statusText}`,
        );
      }

      const j = await res.json();
      const pts: any[] = j?.result?.points ?? j?.result ?? j?.points ?? [];
      if (!pts.length) break;

      for (const p of pts) {
        yield p;
      }

      offset += pts.length;
      if (pts.length < pageSize) break;
    }
  }
}
