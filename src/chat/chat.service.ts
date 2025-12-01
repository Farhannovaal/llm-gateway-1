import { Injectable } from '@nestjs/common';
import { LlmService, ChatMessage } from '../llm/llm.service';
import { ChatRagService, RagMode } from './chat-rag.service';
import { ChatLogService } from '../chat-db/chat-log.service';
import { ChatTurn } from '../chat-db/entities/chat-turn.entity';

interface ChatOptions {
  tags?: string[];
  mode?: RagMode;
  sessionId?: string;
  userId?: string;
}

@Injectable()
export class ChatService {
  private readonly historyMaxTurns = 6;

  constructor(
    private readonly llm: LlmService,
    private readonly chatRag: ChatRagService,
    private readonly chatLog: ChatLogService,
  ) {}

  private withSystem(messages: ChatMessage[]): ChatMessage[] {
    const hasSystem = messages.some((m) => m.role === 'system');
    if (hasSystem) return messages;

    const sys: ChatMessage = {
      role: 'system',
      content: [
        'Kamu adalah asisten AI internal Farhan.',
        'Jawab dengan gaya natural seperti chat, tidak kaku, tapi tetap sopan dan profesional.',
        'Jawaban harus singkat, jelas, dan pakai bahasa Indonesia kalau pengguna pakai bahasa Indonesia.',
        'Backend sudah mendukung streaming, jadi jangan pernah bilang kamu tidak bisa stream atau real-time.',
        'Tidak perlu menyebut teknologi atau infrastruktur internal (seperti server, gateway, dan sejenisnya) kecuali pengguna bertanya langsung tentang itu.',
      ].join(' '),
    };

    return [sys, ...messages];
  }

  private getLastUserText(messages: ChatMessage[]): string {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    return lastUser?.content ?? '';
  }

  private isDateOrTimeQuestion(q: string): boolean {
    const t = q.toLowerCase();

    const keywords = [
      'tanggal berapa sekarang',
      'sekarang tanggal berapa',
      'hari ini tanggal berapa',
      'hari apa sekarang',
      'hari apa ini',
      'jam berapa sekarang',
      'pukul berapa sekarang',
      'waktu sekarang',
    ];

    return keywords.some((k) => t.includes(k));
  }

  private buildNowText(): string {
    const now = new Date();

    const tanggal = now.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Jakarta',
    });

    const jam = now.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'Asia/Jakarta',
    });

    return `Sekarang ${tanggal}, pukul ${jam} WIB.`;
  }

  private async buildHistoryPrefix(
    sessionId?: string,
  ): Promise<{ historyText: string | null; usedHistory: boolean }> {
    if (!sessionId) {
      return { historyText: null, usedHistory: false };
    }

    const turns: ChatTurn[] = await this.chatLog.getRecentTurns(
      sessionId,
      this.historyMaxTurns,
    );

    if (!turns.length) {
      return { historyText: null, usedHistory: false };
    }

    const sorted = [...turns].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );

    const historyText = sorted
      .map(
        (t, idx) =>
          `[${idx + 1}]\nUSER: ${t.userText}\nASSISTANT: ${t.assistantText}`,
      )
      .join('\n\n');

    return { historyText, usedHistory: true };
  }

  async chat(messages: ChatMessage[], options?: ChatOptions) {
    const withSys = this.withSystem(messages);
    const q = this.getLastUserText(withSys);

    // Shortcut pertanyaan waktu/tanggal
    if (this.isDateOrTimeQuestion(q)) {
      const text = this.buildNowText();

      await this.chatLog.saveTurn({
        sessionId: options?.sessionId,
        userId: options?.userId,
        title: null,
        userText: q,
        assistantText: text,
        references: [],
        mode: 'llm-only',
        usedRag: false,
        hitsCount: 0,
        modelId: null,
        latencyMs: 0,
        meta: { kind: 'date-time-shortcut', usedHistory: false },
      });

      return { text };
    }

    const { historyText, usedHistory } = await this.buildHistoryPrefix(
      options?.sessionId,
    );

    const userQuery = historyText
      ? [
          'Riwayat percakapan sebelumnya:',
          historyText,
          '',
          'Pertanyaan terbaru pengguna:',
          q,
        ].join('\n')
      : q;

    const started = Date.now();
    const res = await this.chatRag.answer(userQuery, {
      tags: options?.tags,
      mode: options?.mode,
    });
    const latencyMs = Date.now() - started;

    const { sessionId } = await this.chatLog.saveTurn({
      sessionId: options?.sessionId,
      userId: options?.userId,
      title: null,
      userText: q,
      assistantText: res.text,
      references: res.references,
      mode: res.mode,
      usedRag: res.usedRag,
      hitsCount: res.hitsCount,
      modelId: process.env.MODEL_ID || null,
      latencyMs,
      meta: usedHistory ? { usedHistory: true } : null,
    });

    return { text: res.text, sessionId };
  }

  async stream(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<AsyncIterable<string>> {
    const withSys = this.withSystem(messages);
    const q = this.getLastUserText(withSys);

    if (this.isDateOrTimeQuestion(q)) {
      const answer = this.buildNowText();
      const self = this;

      async function* gen(): AsyncIterable<string> {
        const buf: string[] = [];
        const words = answer.split(' ');
        const started = Date.now();

        for (const w of words) {
          buf.push(w + ' ');
          yield w + ' ';
          await new Promise((r) => setTimeout(r, 10));
        }

        const latencyMs = Date.now() - started;

        await self.chatLog.saveTurn({
          sessionId: options?.sessionId,
          userId: options?.userId,
          title: null,
          userText: q,
          assistantText: buf.join(''),
          references: [],
          mode: 'llm-only',
          usedRag: false,
          hitsCount: 0,
          modelId: null,
          latencyMs,
          meta: { kind: 'date-time-shortcut', usedHistory: false },
        });
      }

      return gen();
    }

    const { historyText, usedHistory } = await this.buildHistoryPrefix(
      options?.sessionId,
    );

    const userQuery = historyText
      ? [
          'Riwayat percakapan sebelumnya:',
          historyText,
          '',
          'Pertanyaan terbaru pengguna:',
          q,
        ].join('\n')
      : q;

    const started = Date.now();
    const {
      stream: baseStream,
      references,
      mode,
      usedRag,
      hitsCount,
    } = await this.chatRag.smartStream(userQuery, {
      tags: options?.tags,
      mode: options?.mode,
    });

    const self = this;

    async function* wrapped(): AsyncIterable<string> {
      const buf: string[] = [];
      for await (const delta of baseStream) {
        if (!delta) continue;
        buf.push(delta);
        yield delta;
      }

      const latencyMs = Date.now() - started;

      await self.chatLog.saveTurn({
        sessionId: options?.sessionId,
        userId: options?.userId,
        title: null,
        userText: q,
        assistantText: buf.join(''),
        references,
        mode,
        usedRag,
        hitsCount,
        modelId: process.env.MODEL_ID || null,
        latencyMs,
        meta: usedHistory ? { usedHistory: true } : null,
      });
    }

    return wrapped();
  }
}
