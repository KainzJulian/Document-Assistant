import { expect, test } from '@playwright/test';
import { ADMIN, freshSession, loginAs, uploadSamples } from './helpers';

test('AC-7.1 nobody can open another person\'s private data; shared documents are read-only', async ({ browser }) => {
  const anna = await freshSession(browser, 'ann');
  await uploadSamples(anna.page, 'notiz-de.txt');
  const annaDocs = (await (await anna.page.request.get('/api/documents')).json()) as { id: string }[];
  const docId = annaDocs[0].id;

  const ben = await freshSession(browser, 'ben');
  await ben.page.goto('/library');
  await expect(ben.page.getByText('Einkaufsliste und Notizen')).toHaveCount(0);
  expect((await ben.page.request.get(`/api/documents/${docId}`)).status()).toBe(404);
  await ben.page.goto(`/library/${docId}`);
  await expect(ben.page.getByText('Dieses Dokument gibt es nicht (mehr).')).toBeVisible();

  await anna.page.goto(`/library/${docId}`);
  await anna.page.getByLabel('Mit Haushalt teilen').check();
  await expect(anna.page.getByText('Gespeichert.').first()).toBeVisible();

  await ben.page.goto('/library');
  await ben.page.locator('select').nth(2).selectOption({ label: 'Mit mir geteilt' });
  await expect(ben.page.getByText('Einkaufsliste und Notizen')).toBeVisible();
  await ben.page.getByRole('link', { name: 'Einkaufsliste und Notizen' }).first().click();
  await expect(ben.page.getByLabel('Mit Haushalt teilen')).toHaveCount(0);
  await expect(ben.page.getByRole('button', { name: 'Löschen' })).toHaveCount(0);
  expect((await ben.page.request.delete(`/api/documents/${docId}`, { headers: { 'X-Requested-With': 'app' } })).status()).toBe(403);
});

test('AC-7.1 chats are private to their owner', async ({ browser }) => {
  const anna = await freshSession(browser, 'cha');
  await uploadSamples(anna.page, 'notiz-de.txt');
  await anna.page.goto('/');
  await anna.page.getByRole('button', { name: 'Alle auswählen' }).click();
  await anna.page.getByLabel('Frage an die Dokumente').fill('Wie lange ist die Kündigungsfrist?');
  await anna.page.getByRole('button', { name: 'Senden' }).click();
  await anna.page.waitForURL('**/chat/**');
  const chatUrl = anna.page.url();

  const ben = await freshSession(browser, 'chb');
  await ben.page.goto(chatUrl);
  await expect(ben.page.locator('app-message')).toHaveCount(0);
  expect((await ben.page.request.get(`/api/chats/${chatUrl.split('/').pop()}`)).status()).toBe(404);
});

test('AC-7.1 only the admin sees and uses the user management', async ({ browser }) => {
  const member = await freshSession(browser, 'usr');
  await expect(member.page.getByRole('link', { name: 'Benutzer' })).toHaveCount(0);
  expect((await member.page.request.get('/api/users')).status()).toBe(403);

  const admin = await (await browser.newContext()).newPage();
  await loginAs(admin, ADMIN);
  await admin.getByRole('link', { name: 'Benutzer' }).click();
  await admin.getByLabel('Benutzername').fill(`neu${Math.random().toString(36).slice(2, 7)}`);
  await admin.getByLabel('Anzeigename').fill('Neue Person');
  await admin.getByLabel('Passwort', { exact: true }).fill('Test-Passw0rd-1');
  await admin.getByRole('button', { name: 'Benutzer anlegen' }).click();
  await expect(admin.getByText('Benutzer angelegt.')).toBeVisible();
});

test('AC-7.1 a wrong password is refused and five failures lock the account for a while', async ({ browser }) => {
  const { person } = await freshSession(browser, 'lck');
  const page = await (await browser.newContext()).newPage();
  for (let i = 0; i < 5; i++) {
    await page.goto('/login');
    await page.getByLabel('Benutzername').fill(person.username);
    await page.getByLabel('Passwort').fill('falsch-falsch');
    await page.getByRole('button', { name: 'Anmelden' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
  }
  await page.getByLabel('Passwort').fill(person.password);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('alert')).toContainText('Zu viele Fehlversuche');
});
