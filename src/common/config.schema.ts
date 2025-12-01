import { IsIn, IsOptional, IsString } from 'class-validator';

export class EnvSchema {
  @IsString()
  @IsIn(['ollama', 'openai'])
  LLM_PROVIDER!: 'ollama' | 'openai';

  @IsString()
  @IsOptional()
  OPENAI_API_KEY?: string;

  @IsString()
  @IsOptional()
  OLLAMA_BASE_URL?: string;

  @IsString()
  @IsOptional()
  EMBEDDING_MODEL_ID?: string;

  @IsString()
  @IsOptional()
  MODEL_ID?: string;

  @IsString()
  HMAC_SHARED_SECRET!: string;

  @IsString()
  @IsOptional()
  PORT?: string;

  @IsString()
  @IsOptional()
  RATE_LIMIT_PER_MIN?: string;

  @IsString()
  @IsOptional()
  QDRANT_URL?: string;

  @IsString()
  @IsOptional()
  QDRANT_COLLECTION?: string;

  @IsString()
  @IsOptional()
  CHAT_DB_HOST?: string;

  @IsString()
  @IsOptional()
  CHAT_DB_PORT?: string;

  @IsString()
  @IsOptional()
  CHAT_DB_USER?: string;

  @IsString()
  @IsOptional()
  CHAT_DB_PASS?: string;

  @IsString()
  @IsOptional()
  CHAT_DB_NAME?: string;

  @IsString()
  @IsOptional()
  CHAT_DB_LOGGING?: string; 
}
