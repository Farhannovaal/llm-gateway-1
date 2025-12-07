import { Injectable, Logger } from '@nestjs/common';
import { LlmService, ChatMessage } from '../llm/llm.service';
import { RagService } from '../rag/rag.service';
import { RagSearchHit } from '../rag/interfaces/rag.interfaces';
import {
  ChatRagOptions,
  ChatRagAnswer,
  ChatRagStreamResult,
} from './interface/chat-rag.interface';

export type RagMode = 'auto' | 'rag-only' | 'llm-only';

@Injectable()
export class ChatRagService {
  private readonly logger = new Logger(ChatRagService.name);
  private readonly defaultMode: RagMode;
  private readonly topK = Number(process.env.RAG_TOP_K ?? 5);

  constructor(
    private readonly llm: LlmService,
    private readonly rag: RagService,
  ) {
    const env = (process.env.CHAT_RAG_MODE ?? 'auto').toLowerCase();
    if (env === 'rag-only' || env === 'llm-only' || env === 'auto') {
      this.defaultMode = env;
    } else {
      this.defaultMode = 'auto';
    }
  }

  private extractBoltSizeToken(q: string): string | null {
    const m = q.match(/\bM\d+(?:x\d+(?:\.\d+)?)?\b/i);
    return m ? m[0] : null;
  }


  private rerankHits(hits: RagSearchHit[], userQuery: string): RagSearchHit[] {
    const sizeToken = this.extractBoltSizeToken(userQuery);
    if (!sizeToken) {
      return [...hits].sort((a, b) => b.score - a.score);
    }

    const tokenLower = sizeToken.toLowerCase();

    const sorted = [...hits].sort((a, b) => {
      const aHas = (a.content ?? '').toLowerCase().includes(tokenLower);
      const bHas = (b.content ?? '').toLowerCase().includes(tokenLower);

      if (aHas && !bHas) return -1;
      if (!aHas && bHas) return 1;

      return b.score - a.score;
    });

    this.logger.debug(
      `RAG rerankHits with sizeToken="${sizeToken}", ` +
        `beforeTopScore=${hits[0]?.score.toFixed(3)}, ` +
        `afterTopScore=${sorted[0]?.score.toFixed(3)}`,
    );

    return sorted;
  }

  private resolveMode(opt?: ChatRagOptions): RagMode {
    return opt?.mode ?? this.defaultMode;
  }

  private shouldUseRagInAuto(
    userQuery: string,
    opts?: { tags?: string[] },
  ): boolean {
    const q = userQuery.toLowerCase();

    if (opts?.tags?.some((t) => ['rag', 'kb-default'].includes(t))) {
      return true;
    }

    if (q.length < 25) {
      const trivial = ['halo', 'hi', 'hai', 'pagi', 'siang', 'malam', 'thanks', 'terima kasih'];
      if (trivial.some((w) => q.includes(w))) return false;
    }

    const domainKeywords = [
      'rag',
      'kpi',
      'scheduler',
      'qdrant',
      'llm-gateway',
      'internal',
      'kb',
    ];
    const hasDomainKeyword = domainKeywords.some((w) => q.includes(w));
    if (!hasDomainKeyword) return false;

    return true;
  }

  // =========================
  // Context builder
  // =========================
  private buildContext(hits: RagSearchHit[]): string {
    const maxCharsPerChunk = 800;
    const maxTotalChars = 4000;

    const blocks: string[] = [];
    let total = 0;

    for (let i = 0; i < hits.length; i++) {
      const h = hits[i];
      let content = h.content ?? '';

      if (content.length > maxCharsPerChunk) {
        content = content.slice(0, maxCharsPerChunk) + '…';
      }

      const block = `【${i + 1} | ${h.source}${h.uri ? ` | ${h.uri}` : ''}】\n${content}`;

      if (total + block.length > maxTotalChars) {
        break;
      }

      blocks.push(block);
      total += block.length;
    }

    return blocks.join('\n\n');
  }

  private buildUserContent(
    userQuery: string,
    historyText?: string | null,
    context?: string,
  ): string {
    const blocks: string[] = [];

    if (historyText) {
      blocks.push('RIWAYAT OBROLAN SEBELUMNYA (ringkas):\n' + historyText);
    }

    if (context) {
      blocks.push('CONTEXT (dokumen hasil RAG):\n' + context);
    }

    blocks.push('PERTANYAAN PENGGUNA SAAT INI:\n' + userQuery);

    return blocks.join('\n\n');
  }

  private buildRagMessages(
    context: string,
    userQuery: string,
    historyText?: string | null,
  ): ChatMessage[] {
    const sys = [
      'Kamu adalah asisten AI internal Farhan.',
      'CONTEXT berisi potongan dokumen referensi dari sistem internal.',
      'Jika ada RIWAYAT OBROLAN, gunakan itu untuk menjaga konsistensi konteks percakapan.',
      'Gunakan CONTEXT hanya sebagai fakta tambahan. Jika tidak relevan, katakan jujur.',
      'Jawablah dengan gaya natural seperti chat, sopan, dan ringkas.',
      'Gunakan bahasa Indonesia jika pengguna memakai bahasa Indonesia.',
      'Jika informasi yang diminta tidak ada atau tidak cukup jelas di CONTEXT, katakan dengan jujur bahwa kamu belum punya informasi tersebut berdasarkan data yang ada.',
    ].join(' ');

    return [
      { role: 'system', content: sys },
      {
        role: 'user',
        content: this.buildUserContent(userQuery, historyText, context),
      },
    ];
  }

  private buildNormalMessages(
    userQuery: string,
    historyText?: string | null,
  ): ChatMessage[] {
    const sys = [
      'Kamu adalah asisten AI internal Farhan.',
      'Jawab dengan gaya natural, sopan, dan tidak kaku seperti robot.',
      'Jawaban harus singkat, jelas, dan pakai bahasa Indonesia kalau pengguna pakai bahasa Indonesia.',
      'Jika ada RIWAYAT OBROLAN dalam input, gunakan secukupnya untuk menjaga konteks.',
      'Tidak perlu menyebut istilah teknis internal (server, gateway, database) kecuali pengguna bertanya langsung.',
    ].join(' ');

    return [
      { role: 'system', content: sys },
      {
        role: 'user',
        content: this.buildUserContent(userQuery, historyText, undefined),
      },
    ];
  }

  async answer(
    userQuery: string,
    options?: ChatRagOptions,
  ): Promise<ChatRagAnswer> {
    const mode = this.resolveMode(options);
    const historyText = options?.historyText ?? null;

    if (mode === 'llm-only') {
      const res = await this.llm.chat(
        this.buildNormalMessages(userQuery, historyText),
      );
      return {
        text: res.text,
        references: [],
        mode,
        usedRag: false,
        hitsCount: 0,
      };
    }

    if (mode === 'auto' && !this.shouldUseRagInAuto(userQuery, { tags: options?.tags })) {
      const res = await this.llm.chat(
        this.buildNormalMessages(userQuery, historyText),
      );
      return {
        text: res.text,
        references: [],
        mode,
        usedRag: false,
        hitsCount: 0,
      };
    }

    let hits: RagSearchHit[] = await this.rag.search(userQuery, {
      tags: options?.tags,
    });

    if (!hits.length) {
      if (mode === 'rag-only') {
        return {
          text: 'Maaf, aku belum menemukan informasi tentang itu di data internal.',
          references: [],
          mode,
          usedRag: false,
          hitsCount: 0,
        };
      }

      const res = await this.llm.chat(
        this.buildNormalMessages(userQuery, historyText),
      );

      return {
        text: res.text,
        references: [],
        mode,
        usedRag: false,
        hitsCount: 0,
      };
    }

    const sizeToken = this.extractBoltSizeToken(userQuery);
    if (sizeToken) {
      const tokenLower = sizeToken.toLowerCase();
      const hasSizeToken = hits.some((h) =>
        (h.content ?? '').toLowerCase().includes(tokenLower),
      );

      if (!hasSizeToken) {
        this.logger.warn(
          `No hit contains sizeToken="${sizeToken}" with tags=${JSON.stringify(
            options?.tags,
          )}, retrying search WITHOUT tags`,
        );

        const hitsWithoutTags = await this.rag.search(userQuery, {
          tags: undefined,
        });

        if (hitsWithoutTags.length) {
          hits = hitsWithoutTags;
        }
      }
    }

    const rankedHits = this.rerankHits(hits, userQuery);
    const usedHits = rankedHits.slice(0, this.topK);

    this.logger.debug(
      `RAG usedHits for query="${userQuery}": ` +
        usedHits
          .map(
            (h, idx) =>
              `#${idx + 1} score=${h.score.toFixed(3)} docId=${h.docId} ` +
              `source=${h.source} snippet="${(h.content ?? '')
                .slice(0, 120)
                .replace(/\s+/g, ' ')}"`,
          )
          .join(' | '),
    );

    const context = this.buildContext(usedHits);
    const messages = this.buildRagMessages(context, userQuery, historyText);
    const res = await this.llm.chat(messages);

    return {
      text: res.text,
      references: usedHits.map((h, i) => ({
        idx: i + 1,
        source: h.source,
        uri: h.uri ?? null,
      })),
      mode,
      usedRag: true,
      hitsCount: hits.length,
    };
  }

  async smartStream(
    userQuery: string,
    options?: ChatRagOptions,
  ): Promise<ChatRagStreamResult> {
    const mode = this.resolveMode(options);
    const historyText = options?.historyText ?? null;

    if (mode === 'llm-only') {
      const baseStream = await this.llm.stream(
        this.buildNormalMessages(userQuery, historyText),
      );
      return {
        stream: baseStream,
        references: [],
        mode,
        usedRag: false,
        hitsCount: 0,
      };
    }

    if (mode === 'auto' && !this.shouldUseRagInAuto(userQuery, { tags: options?.tags })) {
      const baseStream = await this.llm.stream(
        this.buildNormalMessages(userQuery, historyText),
      );
      return {
        stream: baseStream,
        references: [],
        mode,
        usedRag: false,
        hitsCount: 0,
      };
    }

    let hits: RagSearchHit[] = await this.rag.search(userQuery, {
      tags: options?.tags,
    });

    if (!hits.length) {
      if (mode === 'rag-only') {
        const msg = 'Maaf, aku belum menemukan informasi tentang itu di data internal.';

        async function* gen(): AsyncIterable<string> {
          for (const ch of msg) {
            yield ch;
            await new Promise((r) => setTimeout(r, 5));
          }
        }

        return {
          stream: gen(),
          references: [],
          mode,
          usedRag: false,
          hitsCount: 0,
        };
      }

      const baseStream = await this.llm.stream(
        this.buildNormalMessages(userQuery, historyText),
      );
      return {
        stream: baseStream,
        references: [],
        mode,
        usedRag: false,
        hitsCount: 0,
      };
    }

    const sizeToken = this.extractBoltSizeToken(userQuery);
    if (sizeToken) {
      const tokenLower = sizeToken.toLowerCase();
      const hasSizeToken = hits.some((h) =>
        (h.content ?? '').toLowerCase().includes(tokenLower),
      );

      if (!hasSizeToken) {
        this.logger.warn(
          `[stream] No hit contains sizeToken="${sizeToken}" with tags=${JSON.stringify(
            options?.tags,
          )}, retrying search WITHOUT tags`,
        );

        const hitsWithoutTags = await this.rag.search(userQuery, {
          tags: undefined,
        });

        if (hitsWithoutTags.length) {
          hits = hitsWithoutTags;
        }
      }
    }

    const rankedHits = this.rerankHits(hits, userQuery);
    const usedHits = rankedHits.slice(0, this.topK);

    this.logger.debug(
      `RAG usedHits (stream) for query="${userQuery}": ` +
        usedHits
          .map(
            (h, idx) =>
              `#${idx + 1} score=${h.score.toFixed(3)} docId=${h.docId} ` +
              `source=${h.source} snippet="${(h.content ?? '')
                .slice(0, 120)
                .replace(/\s+/g, ' ')}"`,
          )
          .join(' | '),
    );

    const context = this.buildContext(usedHits);
    const messages = this.buildRagMessages(context, userQuery, historyText);
    const baseStream = await this.llm.stream(messages);

    return {
      stream: baseStream,
      references: usedHits.map((h, i) => ({
        idx: i + 1,
        source: h.source,
        uri: h.uri ?? null,
      })),
      mode,
      usedRag: true,
      hitsCount: hits.length,
    };
  }
}
