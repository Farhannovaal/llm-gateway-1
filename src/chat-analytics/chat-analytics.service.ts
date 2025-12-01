import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  In,
  Repository,
} from 'typeorm';

import { ChatTurn } from '../chat-db/entities/chat-turn.entity';
import { ChatReference } from '../chat-db/entities/chat-reference.entity';
import { ChatSession } from '../chat-db/entities/chat-session.entity';
import { CHAT_DB_CONNECTION } from '../chat-db/chat-db.module';
import { LlmService, ChatMessage } from '../llm/llm.service';

import {
  DailySummaryItem,
  SourceUsageItem,
  HistoryUsageItem,
  ModeUsageItem,
  SessionSummaryItem,
  GlobalSummary,
  SessionListItem,
  SessionTurnItem,
} from './chat-analytics.types';

@Injectable()
export class ChatAnalyticsService {
  constructor(
    @InjectRepository(ChatTurn, CHAT_DB_CONNECTION)
    private readonly turnRepo: Repository<ChatTurn>,

    @InjectRepository(ChatReference, CHAT_DB_CONNECTION)
    private readonly refRepo: Repository<ChatReference>,

    @InjectRepository(ChatSession, CHAT_DB_CONNECTION)
    private readonly sessionRepo: Repository<ChatSession>,

    private readonly llm: LlmService,
  ) {}

  private getSince(days: number): Date {
    const since = new Date();
    since.setDate(since.getDate() - days);
    return since;
  }

  async getDailySummary(days = 30): Promise<DailySummaryItem[]> {
    const since = this.getSince(days);

    const rows = await this.turnRepo
      .createQueryBuilder('t')
      .select("DATE_FORMAT(t.createdAt, '%Y-%m-%d')", 'day')
      .addSelect('COUNT(*)', 'totalTurns')
      .addSelect(
        'SUM(CASE WHEN t.usedRag = 1 THEN 1 ELSE 0 END)',
        'turnsUsedRag',
      )
      .addSelect(
        `ROUND(
          SUM(CASE WHEN t.usedRag = 1 THEN 1 ELSE 0 END) * 100.0 /
          NULLIF(COUNT(*), 0),
          2
        )`,
        'pctUsedRag',
      )
      .addSelect('ROUND(AVG(t.latencyMs), 2)', 'avgLatencyMs')
      .where('t.createdAt >= :since', { since })
      .groupBy("DATE_FORMAT(t.createdAt, '%Y-%m-%d')")
      .orderBy('day', 'DESC')
      .getRawMany<{
        day: string;
        totalTurns: string;
        turnsUsedRag: string;
        pctUsedRag: string | null;
        avgLatencyMs: string | null;
      }>();

    return rows.map((r) => ({
      day: r.day,
      totalTurns: Number(r.totalTurns) || 0,
      turnsUsedRag: Number(r.turnsUsedRag) || 0,
      pctUsedRag: r.pctUsedRag !== null ? Number(r.pctUsedRag) : 0,
      avgLatencyMs:
        r.avgLatencyMs !== null && r.avgLatencyMs !== undefined
          ? Number(r.avgLatencyMs)
          : null,
    }));
  }

  async getTopSources(limit = 10): Promise<SourceUsageItem[]> {
    const rows = await this.refRepo
      .createQueryBuilder('r')
      .select('r.source', 'source')
      .addSelect('COUNT(*)', 'totalRefs')
      .groupBy('r.source')
      .orderBy('totalRefs', 'DESC')
      .limit(limit)
      .getRawMany<{ source: string; totalRefs: string }>();

    return rows.map((r) => ({
      source: r.source,
      totalRefs: Number(r.totalRefs) || 0,
    }));
  }

  async getHistoryUsage(days = 30): Promise<HistoryUsageItem[]> {
    const since = this.getSince(days);

    const rows = await this.turnRepo
      .createQueryBuilder('t')
      .select("DATE_FORMAT(t.createdAt, '%Y-%m-%d')", 'day')
      .addSelect('COUNT(*)', 'totalTurns')
      .addSelect(
        `SUM(
          CASE
            WHEN JSON_EXTRACT(t.meta, '$.usedHistory') = true THEN 1
            ELSE 0
          END
        )`,
        'turnsWithHistory',
      )
      .where('t.createdAt >= :since', { since })
      .groupBy("DATE_FORMAT(t.createdAt, '%Y-%m-%d')")
      .orderBy('day', 'DESC')
      .getRawMany<{
        day: string;
        totalTurns: string;
        turnsWithHistory: string;
      }>();

    return rows.map((r) => ({
      day: r.day,
      totalTurns: Number(r.totalTurns) || 0,
      turnsWithHistory: Number(r.turnsWithHistory) || 0,
    }));
  }

  async getModeUsage(days = 30): Promise<ModeUsageItem[]> {
    const since = this.getSince(days);

    const rows = await this.turnRepo
      .createQueryBuilder('t')
      .select("COALESCE(t.mode, 'unknown')", 'mode')
      .addSelect('COUNT(*)', 'totalTurns')
      .addSelect(
        'SUM(CASE WHEN t.usedRag = 1 THEN 1 ELSE 0 END)',
        'turnsUsedRag',
      )
      .addSelect('ROUND(AVG(t.latencyMs), 2)', 'avgLatencyMs')
      .where('t.createdAt >= :since', { since })
      .groupBy("COALESCE(t.mode, 'unknown')")
      .orderBy('totalTurns', 'DESC')
      .getRawMany<{
        mode: string;
        totalTurns: string;
        turnsUsedRag: string;
        avgLatencyMs: string | null;
      }>();

    return rows.map((r) => ({
      mode: r.mode,
      totalTurns: Number(r.totalTurns) || 0,
      turnsUsedRag: Number(r.turnsUsedRag) || 0,
      avgLatencyMs:
        r.avgLatencyMs !== null && r.avgLatencyMs !== undefined
          ? Number(r.avgLatencyMs)
          : null,
    }));
  }

  async summarizeSession(
    sessionId: string,
    maxTurns = 20,
  ): Promise<SessionSummaryItem> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Session ${sessionId} tidak ditemukan`);
    }

    const turns = await this.turnRepo.find({
      where: { session: { id: sessionId } },
      order: { createdAt: 'ASC' },
      take: maxTurns,
    });

    if (!turns.length) {
      return {
        sessionId,
        totalTurns: 0,
        usedRagTurns: 0,
        hasHistory: false,
        lastActivityAt: session.lastActivityAt
          ? session.lastActivityAt.toISOString()
          : null,
        summary: 'Belum ada percakapan pada session ini.',
      };
    }

    const usedRagTurns = turns.filter((t) => t.usedRag).length;
    const hasHistory = turns.some(
      (t: any) => t.meta && t.meta.usedHistory === true,
    );
    const lastActivityAt =
      session.lastActivityAt?.toISOString() ??
      turns[turns.length - 1].createdAt.toISOString();

    const convoText = turns
      .map(
        (t, idx) =>
          `[${idx + 1}]\nUSER: ${t.userText}\nASSISTANT: ${t.assistantText}`,
      )
      .join('\n\n');

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: [
          'Kamu adalah asisten AI internal Farhan.',
          'Tugasmu sekarang adalah merangkum percakapan antara user dan asisten AI.',
          'Ringkasan harus singkat (3–6 kalimat), jelas, dan dalam bahasa Indonesia.',
          'Fokus pada: tujuan user, topik utama, insight/keputusan penting, dan konteks teknis utama (jika ada).',
        ].join(' '),
      },
      {
        role: 'user',
        content: [
          'Berikut adalah percakapan antara user dan asisten AI.',
          'Ringkaslah percakapan ini secara padat dan terstruktur.',
          '',
          convoText,
        ].join('\n'),
      },
    ];

    const res = await this.llm.chat(messages);

    return {
      sessionId,
      totalTurns: turns.length,
      usedRagTurns,
      hasHistory,
      lastActivityAt,
      summary: res.text,
    };
  }

  async getGlobalSummary(
    days = 30,
    topSourceLimit = 5,
  ): Promise<GlobalSummary> {
    const since = this.getSince(days);

    const sessionRow = await this.sessionRepo
      .createQueryBuilder('s')
      .select('COUNT(*)', 'totalSessions')
      .where('s.lastActivityAt >= :since', { since })
      .getRawOne<{ totalSessions: string }>();

    const turnRow = await this.turnRepo
      .createQueryBuilder('t')
      .select('COUNT(*)', 'totalTurns')
      .addSelect(
        'SUM(CASE WHEN t.usedRag = 1 THEN 1 ELSE 0 END)',
        'totalRagTurns',
      )
      .addSelect('ROUND(AVG(t.latencyMs), 2)', 'avgLatencyMs')
      .where('t.createdAt >= :since', { since })
      .getRawOne<{
        totalTurns: string;
        totalRagTurns: string | null;
        avgLatencyMs: string | null;
      }>();

    const totalSessions = Number(sessionRow?.totalSessions) || 0;
    const totalTurns = Number(turnRow?.totalTurns) || 0;
    const totalRagTurns = Number(turnRow?.totalRagTurns) || 0;
    const pctUsedRag =
      totalTurns > 0
        ? Number(((totalRagTurns * 100) / totalTurns).toFixed(2))
        : 0;

    const avgLatencyMs =
      turnRow?.avgLatencyMs !== null && turnRow?.avgLatencyMs !== undefined
        ? Number(turnRow.avgLatencyMs)
        : null;

    const topSources = await this.getTopSources(topSourceLimit);

    return {
      totalSessions,
      totalTurns,
      totalRagTurns,
      pctUsedRag,
      avgLatencyMs,
      topSources,
    };
  }

  async listSessions(
    limit = 20,
    offset = 0,
    userId?: string,
  ): Promise<{
    items: SessionListItem[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const where: Record<string, any> = {};
    if (userId) {
      where.userId = userId;
    }

    const [sessions, total] = await this.sessionRepo.findAndCount({
      where,
      order: {
        lastActivityAt: 'DESC',
        createdAt: 'DESC',
      },
      take: limit,
      skip: offset,
    });

    if (!sessions.length) {
      return { items: [], total, limit, offset };
    }

    const ids = sessions.map((s) => s.id);

    const aggRows = await this.turnRepo
      .createQueryBuilder('t')
      .select('t.sessionId', 'sessionId')
      .addSelect('COUNT(*)', 'totalTurns')
      .addSelect(
        'SUM(CASE WHEN t.usedRag = 1 THEN 1 ELSE 0 END)',
        'usedRagTurns',
      )
      .where('t.sessionId IN (:...ids)', { ids })
      .groupBy('t.sessionId')
      .getRawMany<{
        sessionId: string;
        totalTurns: string;
        usedRagTurns: string | null;
      }>();

    const aggMap = new Map<
      string,
      { totalTurns: number; usedRagTurns: number }
    >();

    for (const r of aggRows) {
      aggMap.set(r.sessionId, {
        totalTurns: Number(r.totalTurns) || 0,
        usedRagTurns: r.usedRagTurns ? Number(r.usedRagTurns) : 0,
      });
    }

    const lastTurns = await this.turnRepo.find({
      where: { session: { id: In(ids) } },
      order: {
        session: { id: 'ASC' },
        createdAt: 'DESC',
      },
    });

    const lastTurnMap = new Map<string, ChatTurn>();
    for (const t of lastTurns) {
      const sid = t.session?.id;
      if (!sid) continue;
      if (!lastTurnMap.has(sid)) {
        lastTurnMap.set(sid, t);
      }
    }

    const items: SessionListItem[] = sessions.map((s) => {
      const agg = aggMap.get(s.id) ?? {
        totalTurns: 0,
        usedRagTurns: 0,
      };
      const lastTurn = lastTurnMap.get(s.id);

      return {
        id: s.id,
        userId: s.userId ?? null,
        title: s.title ?? null,
        createdAt: s.createdAt.toISOString(),
        lastActivityAt: s.lastActivityAt
          ? s.lastActivityAt.toISOString()
          : null,
        totalTurns: agg.totalTurns,
        usedRagTurns: agg.usedRagTurns,
        lastUserText: lastTurn?.userText ?? null,
        lastAssistantText: lastTurn?.assistantText ?? null,
      };
    });

    return { items, total, limit, offset };
  }

  async getSessionTurns(
    sessionId: string,
    maxTurns = 50,
  ): Promise<SessionTurnItem[]> {
    const turns = await this.turnRepo.find({
      where: { session: { id: sessionId } },
      order: { createdAt: 'ASC' },
      take: maxTurns,
    });

    return turns.map((t) => ({
      id: t.id,
      createdAt: t.createdAt.toISOString(),
      userText: t.userText,
      assistantText: t.assistantText,
      mode: t.mode ?? null,
      usedRag: !!t.usedRag,
      hitsCount: t.hitsCount ?? 0,
      latencyMs: t.latencyMs ?? null,
    }));
  }
}
