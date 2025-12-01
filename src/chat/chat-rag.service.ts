import { Injectable } from '@nestjs/common';
import { LlmService, ChatMessage } from '../llm/llm.service';
import { RagService, RagSearchHit } from '../rag/rag.service';

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

@Injectable()
export class ChatRagService {
  private readonly defaultMode: RagMode;

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

  private resolveMode(opt?: ChatRagOptions): RagMode {
    return opt?.mode ?? this.defaultMode;
  }

  private buildContext(hits: RagSearchHit[]): string {
    return hits
      .map(
        (h, i) =>
          `【${i + 1} | ${h.source}${h.uri ? ` | ${h.uri}` : ''}】\n${h.content}`,
      )
      .join('\n\n');
  }

  private buildUserContent(
    userQuery: string,
    historyText?: string | null,
    context?: string,
  ): string {
    const blocks: string[] = [];

    if (historyText) {
      blocks.push(
        'RIWAYAT OBROLAN SEBELUMNYA (ringkas):\n' + historyText,
      );
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

    const hits: RagSearchHit[] = await this.rag.search(userQuery, {
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

      const messages = this.buildNormalMessages(userQuery, historyText);
      const res = await this.llm.chat(messages);

      return {
        text: res.text,
        references: [],
        mode,
        usedRag: false,
        hitsCount: 0,
      };
    }

    const context = this.buildContext(hits);
    const messages = this.buildRagMessages(context, userQuery, historyText);
    const res = await this.llm.chat(messages);

    return {
      text: res.text,
      references: hits.map((h, i) => ({
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

    const hits: RagSearchHit[] = await this.rag.search(userQuery, {
      tags: options?.tags,
    });

    if (!hits.length && mode === 'rag-only') {
      const msg =
        'Maaf, aku belum menemukan informasi tentang itu di data internal.';

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

    const context = hits.length ? this.buildContext(hits) : undefined;
    const messages = context
      ? this.buildRagMessages(context, userQuery, historyText)
      : this.buildNormalMessages(userQuery, historyText);

    const baseStream = await this.llm.stream(messages);

    return {
      stream: baseStream,
      references: hits.map((h, i) => ({
        idx: i + 1,
        source: h.source,
        uri: h.uri ?? null,
      })),
      mode,
      usedRag: hits.length > 0,
      hitsCount: hits.length,
    };
  }
}
