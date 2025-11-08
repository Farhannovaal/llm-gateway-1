import { Observable } from 'rxjs';
import { MessageEvent } from '@nestjs/common';

export function textToSSE(textStream: AsyncIterable<string>): Observable<MessageEvent> {
  return new Observable<MessageEvent>((observer) => {
    (async () => {
      try {
        for await (const chunk of textStream) observer.next({ data: `data: ${chunk}\n\n` });
        observer.complete();
      } catch (e) { observer.error(e); }
    })();
  });
}
