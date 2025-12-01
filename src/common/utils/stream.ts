import { Observable } from 'rxjs';
import { MessageEvent, Logger } from '@nestjs/common';

export function textToSSE(textStream: AsyncIterable<string>): Observable<MessageEvent> {
  const logger = new Logger('SSE');
  const started = performance.now();
  let chars = 0;
  let full = '';

  return new Observable<MessageEvent>((observer) => {
    (async () => {
      try {
        for await (const delta of textStream) {
          if (!delta) continue;

          chars += delta.length;
          full += delta;

          observer.next({
            data: { delta, full },
          });
        }

        const ms = Math.round(performance.now() - started);
        logger.log(`stream done in ${ms}ms chars=${chars}`);
        observer.complete();
      } catch (err: any) {
        const ms = Math.round(performance.now() - started);
        logger.warn(`stream error after ${ms}ms chars=${chars}: ${err?.message || err}`);
        observer.error(err);
      }
    })();
  });
}
