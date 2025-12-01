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
}

@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatSvc: ChatService,
    private readonly chatRag: ChatRagService,
  ) {}

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
    },
  ) {
    return this.chatSvc.chat(body.messages, {
      mode: body.mode,
      tags: body.tags,
      sessionId: body.sessionId,
      userId: body.userId,
    });
  }

  @UseGuards(HmacGuard)
  @Throttle({ default: { ttl: 60_000, limit: 15 } })
  @Sse('stream')
  async stream(@Query() q: AskDto): Promise<Observable<MessageEvent>> {
    const messages: ChatMessage[] = [
      { role: 'user', content: q.q || 'Coba stream jawaban.' },
    ];

    const iter = await this.chatSvc.stream(messages, {
      mode: q.mode,
      tags: q.tags,
    });

    return textToSSE(iter);
  }
}
