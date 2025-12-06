import { JSDOM } from 'jsdom';
import Readability from '@mozilla/readability';
import fetch from 'node-fetch';
import { RagService } from './rag.service';

export async function fetchAndIngestUrl(rag: RagService, url: string, opts: { source?: string; tags?: string[] } = {}) {
  const source = opts.source ?? 'website';
  const tags = opts.tags ?? [];

  const res = await fetch(url, { headers: { 'User-Agent': 'MyRagBot/1.0' } });
  if (!res.ok) throw new Error('fetch failed: ' + res.status);
  const html = await res.text();

  let text = '';
  let title: string | null = null;
  try {
    const dom = new JSDOM(html, { url });
    const doc = new (Readability as any)(dom.window.document).parse();
    if (doc) {
      text = doc.textContent ?? '';
      title = doc.title ?? null;
    }
  } catch (e) {
    text = html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
               .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
               .replace(/<\/?[^>]+(>|$)/g, ' ')
               .replace(/\s+/g, ' ')
               .trim();
  }

  if (!text || text.length < 50) {
    throw new Error('extracted too little text');
  }

  return await rag.ingest({
    source,
    uri: url,
    title: title ?? undefined,
    tags,
    text,
  });
}
