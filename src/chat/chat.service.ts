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
  private readonly historyLimit = 5;

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

  private truncate(text: string, max = 400): string {
    if (!text) return '';
    if (text.length <= max) return text;
    return text.slice(0, max) + '…';
  }

  private formatHistory(turns: ChatTurn[]): string {
    if (!turns.length) return '';

    const ordered = [...turns].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );

    return ordered
      .map(
        (t) =>
          `USER: ${this.truncate(t.userText)}\nASSISTANT: ${this.truncate(
            t.assistantText,
          )}`,
      )
      .join('\n\n');
  }

  async chat(messages: ChatMessage[], options?: ChatOptions) {
    const withSys = this.withSystem(messages);
    const q = this.getLastUserText(withSys);

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
        meta: { kind: 'date-time-shortcut' },
      });

      return { text };
    }

    let historyText: string | null = null;
    let historyTurnsCount = 0;

    if (options?.sessionId) {
      const historyTurns = await this.chatLog.getRecentTurns(
        options.sessionId,
        this.historyLimit,
      );
      if (historyTurns.length) {
        historyText = this.formatHistory(historyTurns);
        historyTurnsCount = historyTurns.length;
      }
    }

    const started = Date.now();
    const res = await this.chatRag.answer(q, {
      tags: options?.tags,
      mode: options?.mode,
      historyText,
    });
    const latencyMs = Date.now() - started;

    const meta =
      historyText && historyTurnsCount > 0
        ? { usedHistory: true, historyTurns: historyTurnsCount }
        : null;

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
      meta,
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
          meta: { kind: 'date-time-shortcut' },
        });
      }

      return gen();
    }

    let historyText: string | null = null;
    let historyTurnsCount = 0;

    if (options?.sessionId) {
      const historyTurns = await this.chatLog.getRecentTurns(
        options.sessionId,
        this.historyLimit,
      );
      if (historyTurns.length) {
        historyText = this.formatHistory(historyTurns);
        historyTurnsCount = historyTurns.length;
      }
    }

    const started = Date.now();
    const {
      stream: baseStream,
      references,
      mode,
      usedRag,
      hitsCount,
    } = await this.chatRag.smartStream(q, {
      tags: options?.tags,
      mode: options?.mode,
      historyText,
    });

    const meta =
      historyText && historyTurnsCount > 0
        ? { usedHistory: true, historyTurns: historyTurnsCount }
        : null;

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
        meta,
      });
    }

    return wrapped();
  }
}
