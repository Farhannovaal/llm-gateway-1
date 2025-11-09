import { Body, Controller, Post, Sse, MessageEvent, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Observable } from 'rxjs';
import { ChatService } from './chat.service';
import { ChatDto } from '../llm/dto/chat.dto';
import { HmacGuard } from '../common/guards/hmac.guard';
import { textToSSE } from '../common/utils/stream';

@Controller('chat')
@UseGuards(HmacGuard)
export class ChatController {
  constructor(private chatSvc: ChatService) {}

  @Throttle({ default: { ttl: 60_000, limit: 40 } })
  @Post()
  async chat(@Body() dto: ChatDto) {
    const { text } = await this.chatSvc.chat(dto.messages);
    return { text };
  }

  @Throttle({ default: { ttl: 60_000, limit: 15 } })
  @Post('stream')
  @Sse('stream')
  async stream(@Body() dto: ChatDto): Promise<Observable<MessageEvent>> {
    const iter = await this.chatSvc.stream(dto.messages);
    return textToSSE(iter);
  }
}
