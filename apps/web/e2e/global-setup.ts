import { request, type FullConfig } from '@playwright/test';
import { ADMIN } from './helpers';

/**
 * Prepare the stack once: wait until it answers, log in as the admin, add a provider (the fake one),
 * and build the embedding model so the vector search path is used too.
 * @param config - Playwright config (holds the base URL).
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0].use.baseURL ?? 'http://127.0.0.1:8090';
  const api = await request.newContext({ baseURL, extraHTTPHeaders: { 'X-Requested-With': 'app' } });
  for (let i = 0; i < 60; i++) {
    const health = await api.get('/api/health').catch(() => null);
    if (health?.ok()) break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  const login = await api.post('/api/auth/login', { data: { username: ADMIN.username, password: ADMIN.password } });
  if (!login.ok()) throw new Error(`Admin login failed (${login.status()}). Did "make test-e2e" create the admin?`);

  const providers = (await (await api.get('/api/admin/providers')).json()) as { id: number }[];
  if (providers.length === 0) {
    const created = await api.post('/api/admin/providers', { data: { kind: 'ollama', label: 'Test-Ollama' } });
    const provider = (await created.json()) as { id: number };
    await api.post(`/api/admin/providers/${provider.id}/test`);
  }
  const models = (await (await api.get('/api/admin/embedding-models')).json()) as unknown[];
  if (models.length === 0) await api.post('/api/admin/embedding-models', { data: { provider: 'ollama', model: 'fake-embed' } });
  for (let i = 0; i < 60; i++) {
    const list = (await (await api.get('/api/admin/embedding-models')).json()) as { status: string }[];
    if (list.some((m) => m.status === 'active')) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  await api.dispose();
}
