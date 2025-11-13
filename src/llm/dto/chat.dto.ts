import { IsArray, IsIn, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ChatMessage } from '../llm.service';

export class ChatMessageDto implements ChatMessage {
  @IsIn(['system', 'user', 'assistant'])
  @IsString()
  role!: 'system' | 'user' | 'assistant';

  @IsString()
  content!: string;
}

export class ChatDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[];
}
