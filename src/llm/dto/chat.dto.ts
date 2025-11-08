import { Type } from 'class-transformer';
import { IsArray, IsIn, IsString, ValidateNested } from 'class-validator';

class MsgDto {
  @IsIn(['system','user','assistant'])
  role!: 'system'|'user'|'assistant';
  @IsString()
  content!: string;
}

export class ChatDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MsgDto)
  messages!: MsgDto[];
}
