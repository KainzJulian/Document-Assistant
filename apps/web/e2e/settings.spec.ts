import { expect, test } from '@playwright/test';
import { ADMIN, freshSession, loginAs } from './helpers';

test('AC-6.1 settings has model, summary language and account; admins also see the providers', async ({ browser }) => {
  const { page } = await freshSession(browser, 'set');
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'KI-Modell' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Zusammenfassungen' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Konto' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Anbieter' })).toHaveCount(0);

  const admin = await (await browser.newContext()).newPage();
  await loginAs(admin, ADMIN);
  await admin.goto('/settings');
  await expect(admin.getByRole('heading', { name: 'Anbieter' })).toBeVisible();
  await expect(admin.getByRole('heading', { name: 'Embedding-Modell' })).toBeVisible();
});

test('AC-6.1 the summary language and the display name are saved', async ({ browser }) => {
  const { page } = await freshSession(browser, 'lng');
  await page.goto('/settings');
  await page.getByRole('radio', { name: 'Deutsch' }).click();
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Deutsch' })).toHaveAttribute('aria-checked', 'true');
  await page.getByLabel('Anzeigename').fill('Neuer Name');
  await page.getByRole('button', { name: 'Namen speichern' }).click();
  await expect(page.getByText('Gespeichert.').first()).toBeVisible();
});

test('AC-6.2 a person picks a model from the admin\'s providers', async ({ browser }) => {
  const { page } = await freshSession(browser, 'mdl');
  await page.goto('/settings');
  const select = page.getByLabel('Modell', { exact: true });
  await expect(select).toContainText('fake-chat');
  await expect(select.locator('optgroup').first()).toHaveAttribute('label', /Lokal \(Ollama\)/);
});

test('AC-6.3 a poor fit shows the numbers; "Abbrechen" keeps the old model, "Trotzdem verwenden" accepts it', async ({ browser }) => {
  const { page } = await freshSession(browser, 'fit');
  await page.goto('/settings');
  const select = page.getByLabel('Modell', { exact: true });

  await select.selectOption({ label: 'qwen2.5:32b' });
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Zu wenig Speicher');
  await expect(dialog).toContainText('16 GB gesamt, 11.2 GB frei');
  await expect(dialog).toContainText('keine GPU');
  await dialog.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(select.locator('option:checked')).toHaveText('fake-chat');

  await select.selectOption({ label: 'llama3.1:8b' });
  await expect(dialog).toContainText('Keine GPU');
  await expect(dialog).toContainText('Wörter pro Sekunde');
  await dialog.getByRole('button', { name: 'Trotzdem verwenden' }).click();
  await expect(select.locator('option:checked')).toHaveText('llama3.1:8b');

  // Accepted once: the same model does not ask again.
  await select.selectOption({ label: 'fake-chat' });
  await select.selectOption({ label: 'llama3.1:8b' });
  await expect(dialog).toBeHidden();
});

test('AC-6.3 the speed test reports a measured value', async ({ browser }) => {
  const { page } = await freshSession(browser, 'bm');
  await page.goto('/settings');
  await page.getByLabel('Modell', { exact: true }).selectOption({ label: 'llama3.1:8b' });
  await page.getByRole('dialog').getByRole('button', { name: 'Geschwindigkeit testen' }).click();
  await expect(page.getByRole('dialog')).toContainText('gemessen');
});

test('AC-7.2 only the admin manages providers; the key is never shown again', async ({ browser }) => {
  const member = await freshSession(browser, 'mem');
  const forbidden = await member.page.request.get('/api/admin/providers');
  expect(forbidden.status()).toBe(403);

  const admin = await (await browser.newContext()).newPage();
  await loginAs(admin, ADMIN);
  await admin.goto('/settings');
  await admin.getByRole('button', { name: 'Anbieter hinzufügen' }).click();
  const dialog = admin.getByRole('dialog');
  await dialog.getByLabel('Art').selectOption('openai');
  await dialog.getByLabel('Bezeichnung').fill('Mein OpenAI');
  await dialog.getByLabel('API-Schlüssel').fill('sk-niemals-anzeigen-1234');
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(admin.getByText('Mein OpenAI')).toBeVisible();
  await expect(admin.getByText('Schlüssel gespeichert')).toBeVisible();
  await expect(admin.locator('body')).not.toContainText('sk-niemals-anzeigen');

  const list = await admin.request.get('/api/admin/providers');
  expect(await list.text()).not.toContain('sk-niemals-anzeigen');
  await admin.getByRole('listitem').filter({ hasText: 'Mein OpenAI' }).getByRole('button', { name: 'Bearbeiten' }).click();
  await expect(admin.getByRole('dialog').getByLabel('API-Schlüssel')).toHaveValue('');
});
