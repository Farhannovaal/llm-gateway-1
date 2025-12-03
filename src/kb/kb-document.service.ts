import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { createHash } from 'crypto';

import { KbDocument } from './kb-document.entity';
import { CreateKbDocumentDto, UpdateKbDocumentDto } from './kb-document.dto';
import { RagService } from '../rag/rag.service';
import { CHAT_DB_CONNECTION } from '../chat-db/chat-db.module';

@Injectable()
export class KbDocumentService {
  constructor(
    @InjectRepository(KbDocument, CHAT_DB_CONNECTION)
    private readonly repo: Repository<KbDocument>,
    private readonly rag: RagService,
  ) {}

  private computeHash(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }

  async findAll(params?: { q?: string; source?: string }) {
    const where: any = {};
    const { q, source } = params || {};

    if (source) {
      where.source = source;
    }

    if (q) {
      return this.repo.find({
        where: [
          { ...where, title: Like(`%${q}%`) },
          { ...where, text: Like(`%${q}%`) },
        ],
        order: { createdAt: 'DESC' },
        take: 50,
      });
    }

    return this.repo.find({
      where,
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async findOne(id: string) {
    const doc = await this.repo.findOne({ where: { id } });
    if (!doc) {
      throw new NotFoundException('Dokumen tidak ditemukan');
    }
    return doc;
  }

  async create(dto: CreateKbDocumentDto) {
    const hash = this.computeHash(dto.text);

    const entity = this.repo.create({
      source: dto.source,
      uri: dto.uri ?? null,
      title: dto.title ?? null,
      lang: dto.lang ?? null,
      tags: dto.tags?.length ? dto.tags : null,
      text: dto.text,
      hash,
    });

    const saved = await this.repo.save(entity);

    await this.rag.ingest({
      docId: saved.id,
      source: saved.source,
      uri: saved.uri ?? undefined,
      title: saved.title ?? undefined,
      lang: saved.lang ?? undefined,
      tags: saved.tags ?? undefined,
      text: saved.text,
    });

    return saved;
  }

  async update(id: string, dto: UpdateKbDocumentDto) {
    const doc = await this.findOne(id);

    if (dto.source !== undefined) doc.source = dto.source;
    if (dto.uri !== undefined) doc.uri = dto.uri ?? null;
    if (dto.title !== undefined) doc.title = dto.title ?? null;
    if (dto.lang !== undefined) doc.lang = dto.lang ?? null;
    if (dto.tags !== undefined) doc.tags = dto.tags?.length ? dto.tags : null;
    if (dto.text !== undefined) {
      doc.text = dto.text;
      doc.hash = this.computeHash(dto.text);
    }

    const saved = await this.repo.save(doc);

    await this.rag.ingest({
      docId: saved.id,
      source: saved.source,
      uri: saved.uri ?? undefined,
      title: saved.title ?? undefined,
      lang: saved.lang ?? undefined,
      tags: saved.tags ?? undefined,
      text: saved.text,
    });

    return saved;
  }

  async remove(id: string) {
    const doc = await this.findOne(id);
    await this.repo.remove(doc);
    return { ok: true };
  }
}
