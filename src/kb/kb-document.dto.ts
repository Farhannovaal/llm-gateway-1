// src/kb/kb-document.dto.ts
import { IsArray, IsOptional, IsString, IsUrl } from 'class-validator';
import { Transform } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';

export class CreateKbDocumentDto {
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
    if (typeof value === 'string' && value.length > 0) {
      return value
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    }
    return [];
  })
  tags?: string[];

  @IsString()
  text!: string;
}

export class UpdateKbDocumentDto extends PartialType(CreateKbDocumentDto) {}
