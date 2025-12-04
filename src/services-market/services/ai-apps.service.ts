import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { AiApp } from '../entities/ai-app.entity';

export interface CreateAiAppDto {
  name: string;
  code: string;
  allowedModels?: string[];
  allowedAssistants?: string[];
  rateLimitPerMin?: number | null;
  isActive?: boolean;
}

export interface UpdateAiAppDto {
  name?: string;
  allowedModels?: string[];
  allowedAssistants?: string[];
  rateLimitPerMin?: number | null;
  isActive?: boolean;
}

@Injectable()
export class AiAppsService {
  constructor(
    @InjectRepository(AiApp)
    private readonly repo: Repository<AiApp>,
  ) {}

  async findAll(): Promise<AiApp[]> {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async findById(id: string): Promise<AiApp> {
    const app = await this.repo.findOne({ where: { id } });
    if (!app) throw new NotFoundException(`App with id ${id} not found`);
    return app;
  }

  async findByCode(code: string): Promise<AiApp | null> {
    return this.repo.findOne({ where: { code } });
  }

  async findByApiKey(apiKey: string): Promise<AiApp | null> {
    return this.repo.findOne({ where: { apiKey } });
  }

  private generateApiKey(): string {
    return randomBytes(32).toString('hex');
  }

  async create(dto: CreateAiAppDto): Promise<AiApp> {
    const apiKey = this.generateApiKey();

    const app = this.repo.create({
      name: dto.name,
      code: dto.code,
      apiKey,
      allowedModels: dto.allowedModels ?? null,
      allowedAssistants: dto.allowedAssistants ?? null,
      rateLimitPerMin: dto.rateLimitPerMin ?? null,
      isActive: dto.isActive ?? true,
    });

    return this.repo.save(app);
  }

  async update(id: string, dto: UpdateAiAppDto): Promise<AiApp> {
    const app = await this.findById(id);

    if (dto.name !== undefined) app.name = dto.name;
    if (dto.allowedModels !== undefined) app.allowedModels = dto.allowedModels;
    if (dto.allowedAssistants !== undefined) {
      app.allowedAssistants = dto.allowedAssistants;
    }
    if (dto.rateLimitPerMin !== undefined) {
      app.rateLimitPerMin = dto.rateLimitPerMin;
    }
    if (dto.isActive !== undefined) app.isActive = dto.isActive;

    return this.repo.save(app);
  }

  async regenerateApiKey(id: string): Promise<AiApp> {
    const app = await this.findById(id);
    app.apiKey = this.generateApiKey();
    return this.repo.save(app);
  }

  async delete(id: string): Promise<void> {
    const app = await this.findById(id);
    await this.repo.remove(app);
  }

  async validateApp(code: string, apiKey: string): Promise<AiApp> {
    const app = await this.repo.findOne({
      where: { code, apiKey, isActive: true },
    });
    if (!app) {
      throw new NotFoundException('Invalid app_code or api_key');
    }
    return app;
  }
}
