import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ChatSession } from './entities/chat-session.entity';
import { ChatTurn } from './entities/chat-turn.entity';
import { ChatReference } from './entities/chat-reference.entity';
import { CHAT_DB_CONNECTION } from './chat-db.module';

export interface SaveTurnInput {
  sessionId?: string;
  userId?: string;
  title?: string | null;
  userText: string;
  assistantText: string;
  references: { idx: number; source: string; uri: string | null | undefined }[];

  mode?: string;
  usedRag?: boolean;
  hitsCount?: number;
  modelId?: string | null;
  latencyMs?: number | null;
  meta?: Record<string, any> | null;
}

@Injectable()
export class ChatLogService {
  constructor(
    @InjectRepository(ChatSession, CHAT_DB_CONNECTION)
    private readonly sessionRepo: Repository<ChatSession>,
    @InjectRepository(ChatTurn, CHAT_DB_CONNECTION)
    private readonly turnRepo: Repository<ChatTurn>,
    @InjectRepository(ChatReference, CHAT_DB_CONNECTION)
    private readonly refRepo: Repository<ChatReference>,
  ) {}

  async getRecentTurns(
    sessionId: string,
    limit = 5,
  ): Promise<ChatTurn[]> {
    if (!sessionId) return [];

    return this.turnRepo.find({
      where: { session: { id: sessionId } },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async saveTurn(input: SaveTurnInput): Promise<{ sessionId: string }> {
    let session: ChatSession | null = null;

    if (input.sessionId) {
      session = await this.sessionRepo.findOne({
        where: { id: input.sessionId },
      });
    }

    if (!session) {
      session = this.sessionRepo.create({
        userId: input.userId,
        title: input.title ?? null,
        lastActivityAt: new Date(),
      });
      session = await this.sessionRepo.save(session);
    } else {
      session.lastActivityAt = new Date();
      await this.sessionRepo.save(session);
    }

    let turn = this.turnRepo.create({
      session,
      userText: input.userText,
      assistantText: input.assistantText,
      mode: input.mode ?? null,
      usedRag: input.usedRag ?? false,
      hitsCount: input.hitsCount ?? 0,
      modelId: input.modelId ?? null,
      latencyMs: input.latencyMs ?? null,
      meta: input.meta ?? null,
    });

    turn = await this.turnRepo.save(turn);

    if (input.references?.length) {
      const refs = input.references.map((r) =>
        this.refRepo.create({
          turn,
          idx: r.idx,
          source: r.source,
          uri: r.uri ?? null,
        }),
      );
      await this.refRepo.save(refs);
    }

    return { sessionId: session.id };
  }
}
