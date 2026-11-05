import { ApiRequestError } from './api';
import { de } from './i18n/de';

/** One Server-Sent Event: its name and the parsed JSON data. */
export interface SseEvent {
  event: string;
  data: unknown;
}

/**
 * POST to the API and read the answer as a Server-Sent Events stream (EventSource cannot POST).
 *
 * @param path - Path below `/api`.
 * @param body - Optional JSON body.
 * @param onEvent - Called for every event, in order.
 * @param signal - Abort it to stop reading (the server keeps what arrived).
 * @throws {ApiRequestError} If the server answers with an HTTP error before the stream starts.
 */
export async function streamPost(
  path: string,
  body: unknown,
  onEvent: (event: SseEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch(`/api${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'X-Requested-With': 'app', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  if (!response.ok || !response.body) {
    const data = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    throw new ApiRequestError(response.status, data?.error?.code ?? 'unknown', data?.error?.message ?? de.errors.unknown);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end = buffer.indexOf('\n\n');
    while (end >= 0) {
      const frame = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      let event = 'message';
      const data: string[] = [];
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
      }
      if (data.length) onEvent({ event, data: JSON.parse(data.join('\n')) as unknown });
      end = buffer.indexOf('\n\n');
    }
  }
}
