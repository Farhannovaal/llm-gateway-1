import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsArray, IsOptional, IsString, IsUrl } from 'class-validator';
import { Transform } from 'class-transformer';

import { RagService } from './rag.service';
import { QdrantService } from './qdrant.service';
import { randomUUID } from 'crypto';
import { fetchAndIngestUrl } from './fetch-worker';

class IngestDto {
  @IsString()
  source!: string;

  @IsOptional()
  @IsUrl()
  uri?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  lang?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.length > 0) return [value];
    return [];
  })
  tags?: string[];

  @IsString()
  text!: string;
}

class SearchDto {
  @IsString()
  q!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.length > 0) {
      return value
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    }
    return [];
  })
  tags?: string[];

  @IsOptional()
  @IsString()
  source?: string;
}

@Controller('rag')
export class RagController {
  private readonly logger = new Logger(RagController.name);

  private jobs: Record<string, { status: string; detail?: any }> = {};

  constructor(
    private readonly rag: RagService,
    private readonly qdrant: QdrantService,
  ) {}

  @Post('documents')
  async ingest(@Body() dto: IngestDto) {
    try {
      return await this.rag.ingest(dto as any);
    } catch (e: any) {
      const msg = e?.message || String(e);
      const depDown =
        /ollama|embed|ECONN|ENOTFOUND|EAI_AGAIN|timeout|fetch failed/i.test(
          msg,
        );
      throw new HttpException(
        { ok: false, error: msg },
        depDown
          ? HttpStatus.SERVICE_UNAVAILABLE
          : HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('search')
  async search(@Query() q: SearchDto) {
    if (!q || !q.q) {
      throw new HttpException(
        { ok: false, error: 'q is required' },
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      const hits = await this.rag.search(q.q, {
        tags: q.tags,
        source: q.source,
      });
      return hits;
    } catch (e: any) {
      const msg = e?.message || String(e);
      const depDown =
        /ollama|embed|ECONN|ENOTFOUND|EAI_AGAIN|timeout|fetch failed/i.test(
          msg,
        );
      throw new HttpException(
        { ok: false, error: msg },
        depDown
          ? HttpStatus.SERVICE_UNAVAILABLE
          : HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('debug/source')
  async debugBySource(
    @Query('source') source: string,
    @Query('limit') limit?: string,
  ) {
    if (!source) {
      throw new HttpException(
        { ok: false, error: 'source is required' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const lim = limit ? Number(limit) || 20 : 20;
    try {
      return await this.qdrant.debugBySource(source, lim);
    } catch (e: any) {
      throw new HttpException(
        { ok: false, error: e?.message || String(e) },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('documents/:id')
  async getChunk(@Param('id') id: string) {
    if (!id) throw new BadRequestException('id is required');
    try {
      const doc = await this.rag.getDocumentById(id);
      if (!doc) {
        throw new HttpException(
          { ok: false, error: 'not found' },
          HttpStatus.NOT_FOUND,
        );
      }
      return { ok: true, document: doc };
    } catch (e: any) {
      throw new HttpException(
        { ok: false, error: e?.message || String(e) },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put('documents/:id')
  async updateChunk(
    @Param('id') id: string,
    @Body() payload: { content?: string; title?: string; tags?: string[] },
  ) {
    if (!id) throw new BadRequestException('id is required');
    if (!payload || !payload.content) {
      throw new BadRequestException('content is required');
    }
    try {
      const res = await this.rag.updateChunk(id, payload.content, {
        title: payload.title,
        tags: payload.tags,
      });
      return res;
    } catch (e: any) {
      const msg = e?.message || String(e);
      throw new HttpException(
        { ok: false, error: msg },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete('documents/:id')
  async deleteChunk(@Param('id') id: string) {
    if (!id) throw new BadRequestException('id is required');
    try {
      const res = await this.rag.deleteOne(id);
      return res;
    } catch (e: any) {
      const msg = e?.message || String(e);
      throw new HttpException(
        { ok: false, error: msg },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete('documents/by-source')
  async deleteBySource(@Query('source') source: string) {
    if (!source) {
      throw new HttpException(
        { ok: false, error: 'source is required' },
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      return await this.rag.deleteBySource(source);
    } catch (e: any) {
      throw new HttpException(
        { ok: false, error: e?.message || String(e) },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('documents')
  async listDocuments(
    @Query('source') source?: string,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string,
  ) {
    const limit = limitStr ? Number(limitStr) || 50 : 50;
    const offset = offsetStr ? Number(offsetStr) || 0 : 0;

    try {
      const res = await this.rag.listDocuments({ source, limit, offset });
      return { ok: true, ...res };
    } catch (e: any) {
      throw new HttpException(
        { ok: false, error: e?.message || String(e) },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('kb-documents/:id')
  async getKbDocument(@Param('id') id: string) {
    if (!id) throw new BadRequestException('id is required');
    try {
      const doc = await this.rag.getKbDocument(id);
      if (!doc) {
        throw new HttpException(
          { ok: false, error: 'not found' },
          HttpStatus.NOT_FOUND,
        );
      }
      return { ok: true, document: doc };
    } catch (e: any) {
      throw new HttpException(
        { ok: false, error: e?.message || String(e) },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put('kb-documents/:id')
  async updateKbDocument(
    @Param('id') id: string,
    @Body()
    payload: {
      source?: string;
      uri?: string;
      title?: string;
      lang?: string;
      tags?: string[];
      text: string;
    },
  ) {
    if (!id) throw new BadRequestException('id is required');
    if (!payload || !payload.text) {
      throw new BadRequestException('text is required');
    }

    try {
      const existing = await this.rag.getKbDocument(id);
      if (!existing) {
        throw new HttpException(
          { ok: false, error: 'document not found' },
          HttpStatus.NOT_FOUND,
        );
      }

      const dto: IngestDto & { docId: string } = {
        docId: id,
        source: payload.source ?? existing.source,
        uri: payload.uri ?? (existing as any).uri ?? undefined,
        title: payload.title ?? (existing as any).title ?? undefined,
        lang: payload.lang ?? (existing as any).lang ?? undefined,
        tags: payload.tags ?? ((existing as any).tags || []),
        text: payload.text,
      };

      const res = await this.rag.ingest(dto as any);
      return { ok: true, ...res };
    } catch (e: any) {
      const msg = e?.message || String(e);
      throw new HttpException(
        { ok: false, error: msg },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete('kb-documents/:id')
  async deleteKbDocument(@Param('id') id: string) {
    if (!id) throw new BadRequestException('id is required');
    try {
      const res = await this.rag.deleteDocumentById(id);
      return res;
    } catch (e: any) {
      const msg = e?.message || String(e);
      throw new HttpException(
        { ok: false, error: msg },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: any,
    @Body() body: { source?: string; tags?: string },
  ) {
    if (!file) {
      throw new BadRequestException('file is required');
    }

    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('file too large');
    }

    const jobId = randomUUID();
    this.jobs[jobId] = {
      status: 'queued',
      detail: {
        filename: file.originalname,
        size: file.size,
        receivedAt: new Date().toISOString(),
        meta: body,
      },
    };

    return {
      ok: true,
      jobId,
      message: 'File received. Extraction should be handled by worker.',
    };
  }

  @Post('reindex')
  async reindex(@Query('source') source?: string) {
    const jobId = randomUUID();
    this.jobs[jobId] = {
      status: 'running',
      detail: {
        startedAt: new Date().toISOString(),
        source: source ?? null,
      },
    };

    (async () => {
      try {
        await this.rag.reindexAll(source ?? null, (progress) => {
          this.jobs[jobId].detail = {
            ...(this.jobs[jobId].detail ?? {}),
            progress,
          };
        });
        this.jobs[jobId].status = 'done';
        this.jobs[jobId].detail.finishedAt = new Date().toISOString();
      } catch (e: any) {
        this.jobs[jobId].status = 'failed';
        this.jobs[jobId].detail.error = e?.message || String(e);
      }
    })();

    return { ok: true, jobId };
  }

  @Get('jobs/:id')
  async getJob(@Param('id') id: string) {
    const j = this.jobs[id];
    if (!j) {
      throw new HttpException(
        { ok: false, error: 'job not found' },
        HttpStatus.NOT_FOUND,
      );
    }
    return { ok: true, job: j };
  }

  @Post('fetch')
  async fetchUrl(
    @Body()
    body: {
      url?: string;
      source?: string;
      tags?: string[];
      snapshot?: boolean;
    },
  ) {
    const url = body?.url;
    if (!url) {
      throw new HttpException(
        { ok: false, error: 'url is required' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const source = body.source ?? 'website';
    const tags = body.tags ?? [];
    const snapshot = Boolean(body.snapshot);

    const jobId = randomUUID();
    this.jobs[jobId] = {
      status: 'queued',
      detail: {
        url,
        source,
        tags,
        snapshot,
        createdAt: new Date().toISOString(),
      },
    };

    (async () => {
      try {
        this.jobs[jobId].status = 'running';
        const result = await fetchAndIngestUrl(this.rag, url, { source, tags });

        this.jobs[jobId].status = 'done';
        this.jobs[jobId].detail = {
          ...(this.jobs[jobId].detail ?? {}),
          result,
        };
      } catch (err: any) {
        this.jobs[jobId].status = 'failed';
        this.jobs[jobId].detail = {
          ...(this.jobs[jobId].detail ?? {}),
          error: err?.message ?? String(err),
        };
      }
    })();

    return { ok: true, jobId };
  }

  @Get('sources')
  async listSources() {
    try {
      const sources = await this.rag.listSourcesFromDocuments();
      return { ok: true, sources };
    } catch (e: any) {
      throw new HttpException(
        { ok: false, error: e?.message || String(e) },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

}
