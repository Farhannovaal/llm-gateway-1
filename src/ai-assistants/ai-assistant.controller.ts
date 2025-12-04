import { Body, Controller, Get, Param, Post, Put, Delete } from '@nestjs/common';
import { AiAssistantsService } from './ai-assistants.service';
import type {
  CreateAssistantDto,
  UpdateAssistantDto,
} from './ai-assistants.service';

@Controller('admin/ai-assistants')
export class AiAssistantsController {
  constructor(private readonly asst: AiAssistantsService) {}

  @Get()
  findAll() {
    return this.asst.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.asst.findById(id);
  }

  @Post()
  create(@Body() dto: CreateAssistantDto) {
    return this.asst.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAssistantDto) {
    return this.asst.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.asst.delete(id);
  }
}
