import { Injectable } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { RagService, RagSearchHit } from '../rag/rag.service'; 

@Injectable()
export class ChatRagService {
  constructor(
    private readonly llm: LlmService,
    private readonly rag: RagService,
  ) {}

  async answer(userQuery: string, options?: { tags?: string[] }) {
    const hits: RagSearchHit[] = await this.rag.search(userQuery, {
      tags: options?.tags,
    });

    const context = hits
      .map(
        (h, i) =>
          `【${i + 1} | ${h.source}${h.uri ? ` | ${h.uri}` : ''}】\n${h.content}`,
      )
      .join('\n\n');

    const sys = [
      'You are a precise assistant.',
      'Answer ONLY from the provided CONTEXT.',
      'If the answer is not present, say you do not know.',
      'Cite the snippet indices you used, e.g., [1][3].',
    ].join(' ');

    const messages = [
      { role: 'system' as const, content: sys },
      {
        role: 'user' as const,
        content: `CONTEXT:\n${context}\n\nQUESTION:\n${userQuery}`,
      },
    ];

    const res = await this.llm.chat(messages);

    return {
      text: res.text,
      references: hits.map((h, i) => ({
        idx: i + 1,
        source: h.source,
        uri: h.uri,
      })),
    };
  }
}
