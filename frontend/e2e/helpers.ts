import path from 'node:path';
import { expect, request, type APIRequestContext, type Browser, type Page } from '@playwright/test';

export const ADMIN = { username: 'admin', password: 'Admin-Passw0rd-1' };
export const SAMPLES = path.resolve(__dirname, '../../backend/eval/extraction/samples');
const BASE = process.env['E2E_URL'] ?? 'http://127.0.0.1:8090';

export interface Person {
  username: string;
  password: string;
}

/**
 * A request context logged in as the admin.
 * @returns The context; dispose it when done.
 */
export async function adminApi(): Promise<APIRequestContext> {
  const api = await request.newContext({ baseURL: BASE, extraHTTPHeaders: { 'X-Requested-With': 'app' } });
  const response = await api.post('/api/auth/login', { data: ADMIN });
  expect(response.ok()).toBeTruthy();
  return api;
}

/**
 * Create a household member with a model already chosen.
 * @param name - Name prefix; a random suffix keeps runs apart.
 * @returns The credentials.
 */
export async function createPerson(name: string): Promise<Person> {
  const person = { username: `${name}${Math.random().toString(36).slice(2, 7)}`, password: 'Test-Passw0rd-1' };
  const admin = await adminApi();
  const created = await admin.post('/api/users', {
    data: { username: person.username, display_name: person.username, password: person.password },
  });
  expect(created.status()).toBe(201);
  await admin.dispose();
  const api = await request.newContext({ baseURL: BASE, extraHTTPHeaders: { 'X-Requested-With': 'app' } });
  await api.post('/api/auth/login', { data: person });
  const settings = (await (await api.get('/api/settings')).json()) as { providers: { id: number }[] };
  await api.put('/api/settings', { data: { provider_id: settings.providers[0].id, model: 'fake-chat', summary_language: 'source' } });
  await api.dispose();
  return person;
}

/**
 * Log a person in through the login page.
 * @param page - The page.
 * @param person - Credentials.
 */
export async function loginAs(page: Page, person: Person): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Benutzername').fill(person.username);
  await page.getByLabel('Passwort').fill(person.password);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page.waitForURL('**/');
}

/**
 * A fresh person, logged in, in a new browser context.
 * @param browser - The browser.
 * @param name - Name prefix.
 * @returns The page and the credentials.
 */
export async function freshSession(browser: Browser, name: string): Promise<{ page: Page; person: Person }> {
  const person = await createPerson(name);
  const page = await (await browser.newContext()).newPage();
  await loginAs(page, person);
  return { page, person };
}

/**
 * Upload sample files in the library and wait until each one is ready.
 * @param page - A page of a logged-in person.
 * @param names - File names in `backend/eval/extraction/samples`.
 */
export async function uploadSamples(page: Page, ...names: string[]): Promise<void> {
  await page.goto('/library');
  await page.locator('input[type=file]').setInputFiles(names.map((n) => path.join(SAMPLES, n)));
  await expect(page.locator('app-status', { hasText: 'Bereit' })).toHaveCount(names.length, { timeout: 60_000 });
}

/**
 * Ask a question in the open chat and wait for the finished answer.
 * @param page - The chat page.
 * @param question - The question.
 */
export async function ask(page: Page, question: string): Promise<void> {
  const before = await page.locator('app-message').count();
  await page.getByLabel('Frage an die Dokumente').fill(question);
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.locator('app-message')).toHaveCount(before + 2);
  await expect(page.getByRole('button', { name: 'Stopp' })).toHaveCount(0, { timeout: 30_000 });
}

/** The question the fake model answers from the notes sample (Mietvertrag). */
export const RENT_QUESTION = 'Welche Frist gilt für die Kündigung des Mieters?';

/**
 * Start a chat about all ready documents from the "Neuer Chat" page and wait for the first answer.
 * @param page - A page of a logged-in person.
 * @param question - The first question.
 */
export async function startChat(page: Page, question: string = RENT_QUESTION): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Alle auswählen' }).click();
  await page.getByLabel('Frage an die Dokumente').fill(question);
  await page.getByRole('button', { name: 'Senden' }).click();
  await page.waitForURL('**/chat/**');
  await expect(page.locator('app-message')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Stopp' })).toHaveCount(0, { timeout: 30_000 });
}
