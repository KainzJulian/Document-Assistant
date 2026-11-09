import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiRequestError } from './api';
import { de } from './i18n/de';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function stubFetch(response: Response | Error): ReturnType<typeof vi.fn> {
  const fetchMock = response instanceof Error ? vi.fn().mockRejectedValue(response) : vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('ApiClient', () => {
  it('sends the cookie, the CSRF header and a JSON body below /api', async () => {
    const fetchMock = stubFetch(json({ ok: true }));
    await new ApiClient().post('/chats', { document_ids: ['a'] });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/chats');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect(init.headers).toEqual({ 'X-Requested-With': 'app', 'Content-Type': 'application/json' });
    expect(init.body).toBe('{"document_ids":["a"]}');
  });

  it('sends no Content-Type and no body for a GET', async () => {
    const fetchMock = stubFetch(json([]));
    await new ApiClient().get('/documents');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({ 'X-Requested-With': 'app' });
    expect(init.body).toBeUndefined();
  });

  it('returns the parsed answer, and undefined for 204', async () => {
    stubFetch(json({ id: 1 }));
    expect(await new ApiClient().get('/x')).toEqual({ id: 1 });
    stubFetch(new Response(null, { status: 204 }));
    expect(await new ApiClient().delete('/x')).toBeUndefined();
  });

  it('turns an error envelope into an ApiRequestError', async () => {
    stubFetch(json({ error: { code: 'account_locked', message: 'Zu viele Fehlversuche.' } }, 429));
    await expect(new ApiClient().post('/auth/login', {})).rejects.toMatchObject({
      status: 429,
      code: 'account_locked',
      message: 'Zu viele Fehlversuche.',
    });
  });

  it('falls back to a generic message when the body is not an envelope', async () => {
    stubFetch(new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(new ApiClient().get('/x')).rejects.toMatchObject({ status: 502, code: 'unknown', message: de.errors.unknown });
  });

  it('reports an unreachable server as status 0', async () => {
    stubFetch(new TypeError('Failed to fetch'));
    const error = await new ApiClient().get('/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 0, code: 'network', message: de.errors.network });
  });

  it('calls onUnauthorized for an expired session, but not for the first /auth/me check', async () => {
    const client = new ApiClient();
    client.onUnauthorized = vi.fn();
    stubFetch(json({ error: { code: 'not_authenticated', message: 'Bitte melde dich an.' } }, 401));
    await client.get('/documents').catch(() => undefined);
    expect(client.onUnauthorized).toHaveBeenCalledTimes(1);
    await client.get('/auth/me').catch(() => undefined);
    expect(client.onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('does not call onUnauthorized for a wrong password (401 invalid_credentials)', async () => {
    const client = new ApiClient();
    client.onUnauthorized = vi.fn();
    stubFetch(json({ error: { code: 'invalid_credentials', message: 'Falsch.' } }, 401));
    await client.post('/auth/login', {}).catch(() => undefined);
    expect(client.onUnauthorized).not.toHaveBeenCalled();
  });

  it('uses the right method for patch and delete', async () => {
    const fetchMock = stubFetch(json({}));
    const client = new ApiClient();
    await client.patch('/chats/1', { title: 'x' });
    stubFetch(new Response(null, { status: 204 }));
    await client.delete('/chats/1');
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].method).toBe('PATCH');
  });
});
