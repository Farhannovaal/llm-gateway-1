import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '../common/config.service';

@Controller()
export class HealthController {
  constructor(private cfg: ConfigService) {}

  @Get('/healthz')
  health() {
    return {
      status: 'ok',
      provider: this.cfg.env.LLM_PROVIDER,
      model: this.cfg.env.MODEL_ID ?? null,
      time: new Date().toISOString(),
    };
  }

  @Get('/readyz')
  async ready() {
    const { LLM_PROVIDER, MODEL_ID, OLLAMA_BASE_URL, OPENAI_API_KEY } = this.cfg.env;

    if (LLM_PROVIDER === 'ollama') {
      const r = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { method: 'GET' });
      if (!r.ok) return { status: 'not-ready', reason: `ollama ${r.status}` };
      const j = await r.json().catch(() => ({} as any));
      const hasModel = !!j?.models?.some((m: any) => m?.model === MODEL_ID);
      return hasModel
        ? { status: 'ready', provider: 'ollama', model: MODEL_ID }
        : { status: 'not-ready', reason: `model ${MODEL_ID} not found` };
    }

    if (LLM_PROVIDER === 'openai') {
      if (!OPENAI_API_KEY) return { status: 'not-ready', reason: 'missing OPENAI_API_KEY' };
      const r = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      }).catch((e) => ({ ok: false, statusText: e?.message ?? 'fetch failed' } as any));
      return r?.ok ? { status: 'ready', provider: 'openai', model: MODEL_ID ?? null }
                   : { status: 'not-ready', reason: `openai: ${r?.statusText ?? r?.status}` };
    }

    return { status: 'not-ready', reason: `unknown provider ${LLM_PROVIDER}` };
  }
}
