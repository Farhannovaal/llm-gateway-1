import { Injectable } from '@nestjs/common';
import { LlmService, ChatMessage } from '../llm/llm.service';
import { RagService, RagSearchHit } from '../rag/rag.service';

export type RagMode = 'auto' | 'rag-only' | 'llm-only';

export interface ChatRagOptions {
  tags?: string[];
  mode?: RagMode;
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

  private buildRagMessages(context: string, userQuery: string): ChatMessage[] {
    const sys = [
      'Kamu adalah asisten AI internal Farhan.',
      'CONTEXT berisi catatan referensi tentang Farhan, sistem, dan pengetahuan terkait.',
      'Gunakan CONTEXT sebagai sumber fakta tambahan untuk menjawab pertanyaan pengguna.',
      'Jawablah dengan gaya natural seperti chat, sopan, dan ringkas.',
      'Gunakan bahasa Indonesia jika pengguna memakai bahasa Indonesia.',
      'Jika informasi yang diminta tidak ada atau tidak cukup jelas di CONTEXT, katakan dengan jujur bahwa kamu belum punya informasi tersebut berdasarkan data yang ada.',
      'Tidak perlu menyebut istilah teknis internal (seperti nama server, database, framework, dan sejenisnya) kecuali pengguna bertanya langsung.',
      'Jika konteks berbicara tentang Farhan, gunakan sudut pandang orang ketiga, contoh: "Farhan lahir di Bandung tahun 2003", bukan "Saya lahir...".',
    ].join(' ');

    return [
      { role: 'system', content: sys },
      {
        role: 'user',
        content: `CONTEXT:\n${context}\n\nPERTANYAAN:\n${userQuery}`,
      },
    ];
  }

  private buildNormalMessages(userQuery: string): ChatMessage[] {
    return [
      {
        role: 'system',
        content: [
          'Kamu adalah asisten AI internal Farhan.',
          'Jawab dengan gaya natural, sopan, dan tidak kaku seperti robot.',
          'Jawaban harus singkat, jelas, dan pakai bahasa Indonesia kalau pengguna pakai bahasa Indonesia.',
          'Tidak perlu menyebut istilah teknis internal (seperti nama server, gateway, database) kecuali pengguna bertanya langsung tentang itu.',
        ].join(' '),
      },
      {
        role: 'user',
        content: userQuery,
      },
    ];
  }

  async answer(
    userQuery: string,
    options?: ChatRagOptions,
  ): Promise<ChatRagAnswer> {
    const mode = this.resolveMode(options);

    if (mode === 'llm-only') {
      const res = await this.llm.chat(this.buildNormalMessages(userQuery));
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

      const messages = this.buildNormalMessages(userQuery);
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
    const messages = this.buildRagMessages(context, userQuery);
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

    if (mode === 'llm-only') {
      const baseStream = await this.llm.stream(
        this.buildNormalMessages(userQuery),
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

    const messages = hits.length
      ? this.buildRagMessages(this.buildContext(hits), userQuery)
      : this.buildNormalMessages(userQuery);

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
