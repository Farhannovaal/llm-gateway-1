import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiKnowledgeBase } from '../entities/ai-knowledge-base.entity';

export interface CreateKnowledgeBaseDto {
  name: string;
  code: string;
  tags: string[];
  description?: string;
  vectorIndex: string;
  isActive?: boolean;
}

export interface UpdateKnowledgeBaseDto {
  name?: string;
  tags?: string[];
  description?: string;
  vectorIndex?: string;
  isActive?: boolean;
}

@Injectable()
export class AiKnowledgeBasesService {
  constructor(
    @InjectRepository(AiKnowledgeBase)
    private readonly repo: Repository<AiKnowledgeBase>,
  ) {}

  async findAll(): Promise<AiKnowledgeBase[]> {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async findById(id: string): Promise<AiKnowledgeBase> {
    const kb = await this.repo.findOne({ where: { id } });
    if (!kb) throw new NotFoundException(`KB with id ${id} not found`);
    return kb;
  }

  async findByCode(code: string): Promise<AiKnowledgeBase> {
    const kb = await this.repo.findOne({ where: { code } });
    if (!kb) throw new NotFoundException(`KB "${code}" not found`);
    return kb;
  }

  async create(dto: CreateKnowledgeBaseDto): Promise<AiKnowledgeBase> {
    const exists = await this.repo.findOne({ where: { code: dto.code } });
    if (exists) {
      throw new BadRequestException(`KB code "${dto.code}" already exists`);
    }

    const kb = this.repo.create({
      name: dto.name,
      code: dto.code,
      tags: dto.tags,
      description: dto.description ?? null,
      vectorIndex: dto.vectorIndex,
      isActive: dto.isActive ?? true,
    });

    return this.repo.save(kb);
  }

  async update(id: string, dto: UpdateKnowledgeBaseDto): Promise<AiKnowledgeBase> {
    const kb = await this.findById(id);

    if (dto.name !== undefined) kb.name = dto.name;
    if (dto.tags !== undefined) kb.tags = dto.tags;
    if (dto.description !== undefined) kb.description = dto.description;
    if (dto.vectorIndex !== undefined) kb.vectorIndex = dto.vectorIndex;
    if (dto.isActive !== undefined) kb.isActive = dto.isActive;

    return this.repo.save(kb);
  }

  async delete(id: string): Promise<void> {
    const kb = await this.findById(id);
    await this.repo.remove(kb);
  }
}
