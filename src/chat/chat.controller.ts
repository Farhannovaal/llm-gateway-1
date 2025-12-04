import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Sse,
  MessageEvent,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Observable } from 'rxjs';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

import { ChatService } from './chat.service';
import { ChatRagService } from './chat-rag.service';
import type { RagMode } from './chat-rag.service';
import { ChatMessage } from '../llm/llm.service';
import { HmacGuard } from '../common/guards/hmac.guard';
import { textToSSE } from '../common/utils/stream';

import { AiAppsService } from '../services-market/services/ai-apps.service';
import { AiAssistantsService } from '../services-market/services/ai-assistants.service';
import type { AssistantMode } from '../services-market/entities/ai-assistant.entity';

class AskDto {
  @IsString()
  q!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.length > 0) {
      return value.split(',').map((x) => x.trim()).filter(Boolean);
    }
    return [];
  })
  tags?: string[];

  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase().trim() : value,
  )
  mode?: RagMode;

  @IsOptional()
  @IsString()
  appCode?: string;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsString()
  assistant?: string;
}

@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatSvc: ChatService,
    private readonly chatRag: ChatRagService,
    private readonly aiApps: AiAppsService,
    private readonly aiAssistants: AiAssistantsService,
  ) {}

  private mapAssistantModeToRag(mode: AssistantMode): RagMode {
    switch (mode) {
      case 'chat':
        return 'llm-only';
      case 'ask':
        return 'rag-only';
      case 'auto':
      default:
        return 'auto';
    }
  }

  @Get('ask')
  ask(@Query() q: AskDto) {
    return this.chatRag.answer(q.q, {
      tags: q.tags,
      mode: q.mode,
    });
  }

  @UseGuards(HmacGuard)
  @Throttle({ default: { ttl: 60_000, limit: 40 } })
  @Post('chat')
  async chat(
    @Body()
    body: {
      messages: ChatMessage[];
      mode?: RagMode;
      tags?: string[];
      sessionId?: string;
      userId?: string;
      appCode?: string;
      apiKey?: string;
      assistant?: string;
    },
  ) {
    let effectiveMode: RagMode | undefined = body.mode;
    let effectiveTags = body.tags;
    let systemPrompt: string | null = null;
    let appCode: string | null = null;
    let assistantSlug: string | null = null;

    if (body.appCode && body.apiKey) {
      const app = await this.aiApps.validateApp(body.appCode, body.apiKey);
      appCode = app.code;
    }

    if (body.assistant) {
      const asst = await this.aiAssistants.findActiveBySlug(body.assistant);
      assistantSlug = asst.slug;
      systemPrompt = asst.systemPrompt;

      if (!effectiveMode && asst.defaultMode) {
        effectiveMode = this.mapAssistantModeToRag(asst.defaultMode);
      }

      if ((!effectiveTags || !effectiveTags.length) && asst.kbTags?.length) {
        effectiveTags = asst.kbTags;
      }
    }

    return this.chatSvc.chat(body.messages, {
      mode: effectiveMode,
      tags: effectiveTags,
      sessionId: body.sessionId,
      userId: body.userId,
      systemPrompt,
      appCode,
      assistantSlug,
    });
  }

  @UseGuards(HmacGuard)
  @Throttle({ default: { ttl: 60_000, limit: 15 } })
  @Sse('stream')
  async stream(@Query() q: AskDto): Promise<Observable<MessageEvent>> {
    const messages: ChatMessage[] = [
      { role: 'user', content: q.q || 'Coba stream jawaban.' },
    ];

    let effectiveMode: RagMode | undefined = q.mode;
    let effectiveTags = q.tags;
    let systemPrompt: string | null = null;
    let appCode: string | null = null;
    let assistantSlug: string | null = null;

    if (q.appCode && q.apiKey) {
      const app = await this.aiApps.validateApp(q.appCode, q.apiKey);
      appCode = app.code;
    }

    if (q.assistant) {
      const asst = await this.aiAssistants.findActiveBySlug(q.assistant);
      assistantSlug = asst.slug;
      systemPrompt = asst.systemPrompt;

      if (!effectiveMode && asst.defaultMode) {
        effectiveMode = this.mapAssistantModeToRag(asst.defaultMode);
      }

      if ((!effectiveTags || !effectiveTags.length) && asst.kbTags?.length) {
        effectiveTags = asst.kbTags;
      }
    }

    const iter = await this.chatSvc.stream(messages, {
      mode: effectiveMode,
      tags: effectiveTags,
      systemPrompt,
      appCode,
      assistantSlug,
    });

    return textToSSE(iter);
  }
}
