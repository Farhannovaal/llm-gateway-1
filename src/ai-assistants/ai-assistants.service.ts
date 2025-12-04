import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiAssistant, AssistantMode } from './entities/ai-assistant.entity';
import { CHAT_DB_CONNECTION } from '../chat-db/chat-db.module';

export interface CreateAssistantDto {
  name: string;
  slug: string;
  description?: string;
  defaultModel: string;
  defaultMode?: AssistantMode;
  systemPrompt: string;
  kbTags?: string[];
  temperature?: number;
  maxTokens?: number | null;
  isActive?: boolean;
}

export interface UpdateAssistantDto {
  name?: string;
  description?: string;
  defaultModel?: string;
  defaultMode?: AssistantMode;
  systemPrompt?: string;
  kbTags?: string[];
  temperature?: number;
  maxTokens?: number | null;
  isActive?: boolean;
}

@Injectable()
export class AiAssistantsService {
  constructor(
    @InjectRepository(AiAssistant, CHAT_DB_CONNECTION)
    private readonly repo: Repository<AiAssistant>,
  ) {}

  async findAll(): Promise<AiAssistant[]> {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async findById(id: string): Promise<AiAssistant> {
    const assistant = await this.repo.findOne({ where: { id } });
    if (!assistant) {
      throw new NotFoundException(`Assistant with id ${id} not found`);
    }
    return assistant;
  }

  async findBySlug(slug: string): Promise<AiAssistant> {
    const assistant = await this.repo.findOne({ where: { slug } });
    if (!assistant) {
      throw new NotFoundException(`Assistant "${slug}" not found`);
    }
    return assistant;
  }

  async findActiveBySlug(slug: string): Promise<AiAssistant> {
    const assistant = await this.repo.findOne({
      where: { slug, isActive: true },
    });
    if (!assistant) {
      throw new NotFoundException(`Active assistant "${slug}" not found`);
    }
    return assistant;
  }

  async create(dto: CreateAssistantDto): Promise<AiAssistant> {
    const exists = await this.repo.findOne({ where: { slug: dto.slug } });
    if (exists) {
      throw new BadRequestException(
        `Assistant slug "${dto.slug}" already exists`,
      );
    }

    const assistant = this.repo.create({
      name: dto.name,
      slug: dto.slug,
      description: dto.description ?? null,
      defaultModel: dto.defaultModel,
      defaultMode: dto.defaultMode ?? 'auto',
      systemPrompt: dto.systemPrompt,
      kbTags: dto.kbTags ?? null,
      temperature: dto.temperature ?? 0.7,
      maxTokens: dto.maxTokens ?? null,
      isActive: dto.isActive ?? true,
    });

    return this.repo.save(assistant);
  }

  async update(id: string, dto: UpdateAssistantDto): Promise<AiAssistant> {
    const assistant = await this.findById(id);

    if (dto.name !== undefined) assistant.name = dto.name;
    if (dto.description !== undefined) assistant.description = dto.description;
    if (dto.defaultModel !== undefined) assistant.defaultModel = dto.defaultModel;
    if (dto.defaultMode !== undefined) assistant.defaultMode = dto.defaultMode;
    if (dto.systemPrompt !== undefined) assistant.systemPrompt = dto.systemPrompt;
    if (dto.kbTags !== undefined) assistant.kbTags = dto.kbTags;
    if (dto.temperature !== undefined) assistant.temperature = dto.temperature;
    if (dto.maxTokens !== undefined) assistant.maxTokens = dto.maxTokens;
    if (dto.isActive !== undefined) assistant.isActive = dto.isActive;

    return this.repo.save(assistant);
  }

  async delete(id: string): Promise<void> {
    const assistant = await this.findById(id);
    await this.repo.remove(assistant);
  }
}
