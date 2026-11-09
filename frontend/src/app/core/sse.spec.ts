import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from './api';
import { streamPost, type SseEvent } from './sse';

/**
 * A response whose body delivers the given chunks one by one.
 * @param chunks
 * @param status
 */
function streamOf(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller): void {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status });
}

async function collect(chunks: string[]): Promise<SseEvent[]> {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamOf(chunks)));
  const events: SseEvent[] = [];
  await streamPost('/chats/1/messages', { content: 'x' }, (e) => events.push(e), new AbortController().signal);
  return events;
}

afterEach(() => vi.unstubAllGlobals());

describe('streamPost', () => {
  it('parses events', async () => {
    const events = await collect(['event: token\ndata: {"text":"Hallo"}\n\nevent: done\ndata: {"ok":true}\n\n']);
    expect(events).toEqual([
      { event: 'token', data: { text: 'Hallo' } },
      { event: 'done', data: { ok: true } },
    ]);
  });

  it('reassembles an event that arrives in pieces, including multi-byte characters', async () => {
    const events = await collect(['event: tok', 'en\ndata: {"text":"Grö', 'ße"}\n', '\n']);
    expect(events).toEqual([{ event: 'token', data: { text: 'Größe' } }]);
  });

  it('sends the CSRF header and the body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(streamOf([]));
    vi.stubGlobal('fetch', fetchMock);
    await streamPost('/chats/1/messages', { content: 'Frage' }, () => undefined, new AbortController().signal);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/chats/1/messages');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['X-Requested-With']).toBe('app');
    expect(init.body).toBe('{"content":"Frage"}');
  });

  it('turns an HTTP error before the stream into an ApiRequestError', async () => {
    const body = JSON.stringify({ error: { code: 'no_model', message: 'Wähle zuerst ein Modell.' } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 422 })));
    await expect(streamPost('/x', undefined, () => undefined, new AbortController().signal)).rejects.toMatchObject({
      status: 422,
      code: 'no_model',
    });
    await expect(streamPost('/x', undefined, () => undefined, new AbortController().signal)).rejects.toBeInstanceOf(ApiRequestError);
  });
});
