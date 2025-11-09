import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '../common/config.service';

@Controller('llm')
export class LlmController {
  constructor(private cfg: ConfigService) {}
  @Get('models')
  async models() {
    const base = this.cfg.env.OLLAMA_BASE_URL;
    if (!base) return { models: [] };
    const r = await fetch(`${base}/api/tags`);
    const j = await r.json().catch(() => ({ models: [] }));
    return j;
  }
}
