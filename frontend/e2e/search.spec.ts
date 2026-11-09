import { expect, test } from '@playwright/test';
import { ask, freshSession, startChat, uploadSamples } from './helpers';

const HEADERS = { 'X-Requested-With': 'app' };

test('AC-4.2 a misspelt search finds the chat, highlights the word and opens it', async ({ browser }) => {
  const { page } = await freshSession(browser, 'srch');
  await uploadSamples(page, 'notiz-de.txt');
  await startChat(page);
  await page.getByRole('button', { name: 'Umbenennen' }).first().click();
  await page.getByLabel('Umbenennen').fill('Zusammenfassung Mietvertrag');
  await page.getByRole('button', { name: 'Speichern' }).click();

  await page.goto('/library');
  await page.getByRole('searchbox', { name: 'Chats durchsuchen' }).fill('Zusamenfassung');
  const hit = page.getByRole('navigation', { name: 'Chats' }).getByRole('button', { name: /Zusammenfassung Mietvertrag/ });
  await expect(hit).toBeVisible();
  await hit.click();
  await page.waitForURL('**/chat/**');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Zusammenfassung Mietvertrag');
});

test('AC-4.2 search also finds words inside messages', async ({ browser }) => {
  const { page } = await freshSession(browser, 'msg');
  await uploadSamples(page, 'notiz-de.txt');
  await startChat(page);
  await ask(page, 'Gibt es Ausnahmen bei der vorzeitigen Auflösung?');
  await page.goto('/library');
  await page.getByRole('searchbox', { name: 'Chats durchsuchen' }).fill('Auflösung');
  await expect(page.getByRole('navigation', { name: 'Chats' }).locator('mark').first()).toBeVisible();
  await page.getByRole('searchbox', { name: 'Chats durchsuchen' }).fill('Fußballergebnis');
  await expect(page.getByText('Keine Chats gefunden.')).toBeVisible();
});

test('AC-4.2 search answers in under 300 ms with 500 chats', async ({ browser }) => {
  test.setTimeout(240_000);
  const { page } = await freshSession(browser, 'big');
  await uploadSamples(page, 'notiz-de.txt');
  const docs = (await (await page.request.get('/api/documents?status=ready')).json()) as { id: string }[];
  for (let i = 0; i < 500; i++) {
    const chat = (await (await page.request.post('/api/chats', { data: { document_ids: [docs[0].id] }, headers: HEADERS })).json()) as { id: string };
    await page.request.patch(`/api/chats/${chat.id}`, { data: { title: `Chat ${i} über Thema ${i % 37}` }, headers: HEADERS });
  }
  const timings: number[] = [];
  for (const q of ['Thema', 'Tema 12', 'Chat 499', 'Themma']) {
    const start = Date.now();
    const response = await page.request.get(`/api/chats?q=${encodeURIComponent(q)}`);
    expect(response.ok()).toBeTruthy();
    timings.push(Date.now() - start);
  }
  expect(Math.max(...timings), `timings ${timings.join(', ')} ms`).toBeLessThan(300);
});
