import { Body, Controller, Get, Post, Query, HttpException, HttpStatus } from '@nestjs/common';
import { IsArray, IsOptional, IsString, IsUrl } from 'class-validator';
import { Transform } from 'class-transformer'; 
import { RagService } from './rag.service';

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
    if (typeof value === 'string' && value.length > 0) return [value];
    return [];
  })
  tags?: string[];

  @IsOptional()
  @IsString()
  source?: string;
}

@Controller('rag')
export class RagController {
  constructor(private readonly rag: RagService) {}

  @Post('documents')
  async ingest(@Body() dto: IngestDto) {
    try {
      return await this.rag.ingest(dto);
    } catch (e: any) {
      const msg = e?.message || String(e);
      const depDown = /ollama|embed|ECONN|ENOTFOUND|EAI_AGAIN|timeout|fetch failed/i.test(msg);
      throw new HttpException({ ok: false, error: msg }, depDown ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('search')
  async search(@Query() q: SearchDto) {
    return this.rag.search(q.q, { tags: q.tags, source: q.source });
  }
}
