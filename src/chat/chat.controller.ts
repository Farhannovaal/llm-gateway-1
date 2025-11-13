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
import { ChatDto } from '../llm/dto/chat.dto';
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
    if (typeof value === 'string' && value.length > 0) return [value];
    return [];
  })
  tags?: string[];
}

@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatSvc: ChatService,
    private readonly chatRag: ChatRagService,
  ) {}

  @Get('ask')
  ask(@Query() q: AskDto) {
    return this.chatRag.answer(q.q, { tags: q.tags });
  }

  @UseGuards(HmacGuard)
  @Throttle({ default: { ttl: 60_000, limit: 40 } })
  @Post()
  async chat(@Body() dto: ChatDto) {
    const { text } = await this.chatSvc.chat(dto.messages);
    return { text };
  }

  @UseGuards(HmacGuard)
  @Throttle({ default: { ttl: 60_000, limit: 15 } })
 @Sse('stream')
  async stream(@Query('q') q: string): Promise<Observable<MessageEvent>> {
    const messages = [
      { role: 'system' as const, content: 'You are a helpful assistant.' },
      { role: 'user' as const, content: q },
    ];
    const iter = await this.chatSvc.stream(messages);
    return textToSSE(iter);
  }
}
