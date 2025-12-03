import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
} from '@nestjs/common';
import {
  CreateKbDocumentDto,
  UpdateKbDocumentDto,
} from './kb-document.dto';
import { KbDocumentService } from './kb-document.service';

@Controller('kb/documents')
export class KbDocumentController {
  constructor(private readonly svc: KbDocumentService) {}

  @Get()
  async list(
    @Query('q') q?: string,
    @Query('source') source?: string,
  ) {
    return this.svc.findAll({ q, source });
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  async create(@Body() dto: CreateKbDocumentDto) {
    return this.svc.create(dto);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateKbDocumentDto,
  ) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
