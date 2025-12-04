import { Body, Controller, Get, Param, Post, Put, Delete } from '@nestjs/common';
import { AiAppsService } from './ai-apps.service';
import type { CreateAiAppDto, UpdateAiAppDto } from './ai-apps.service';

@Controller('admin/ai-apps')
export class AiAppsController {
  constructor(private readonly apps: AiAppsService) {}

  @Get()
  findAll() {
    return this.apps.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.apps.findById(id);
  }

  @Post()
  create(@Body() dto: CreateAiAppDto) {
    return this.apps.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAiAppDto) {
    return this.apps.update(id, dto);
  }

  @Post(':id/regenerate-key')
  regenKey(@Param('id') id: string) {
    return this.apps.regenerateApiKey(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.apps.delete(id);
  }
}