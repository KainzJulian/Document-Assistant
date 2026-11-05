import { expect, test } from '@playwright/test';
import { freshSession } from './helpers';

// The throwaway stack serves e2e/fixtures at http://fixtures:8000 (see infra/docker-compose.e2e.yml).
const ARTICLE = 'http://fixtures:8000/artikel.html';
const TITLE = 'Warum der Wald im Herbst die Farbe wechselt';

test('AC-1.2 a web address becomes a document with title and source; the same address is a duplicate', async ({ browser }) => {
  const { page } = await freshSession(browser, 'url');
  await page.goto('/library');
  await page.getByRole('button', { name: 'URL importieren' }).click();
  await page.getByLabel('Adresse der Webseite').fill(`${ARTICLE}?utm_source=test#oben`);
  await page.getByRole('dialog').getByRole('button', { name: 'Importieren' }).click();
  await expect(page.getByText(TITLE)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('app-status', { hasText: 'Bereit' })).toBeVisible({ timeout: 60_000 });

  await page.getByRole('button', { name: 'URL importieren' }).click();
  await page.getByLabel('Adresse der Webseite').fill(ARTICLE);
  await page.getByRole('dialog').getByRole('button', { name: 'Importieren' }).click();
  await expect(page.getByText('Bereits in deiner Bibliothek').first()).toBeVisible();

  await page.getByText(TITLE).click();
  await expect(page.getByRole('link', { name: ARTICLE })).toBeVisible();
  await expect(page.getByText('Chlorophyll').first()).toBeVisible();
  await expect(page.getByText('Impressum und Datenschutz')).toHaveCount(0);
});

test('AC-1.2 an unreadable page shows the reason and offers "Text einfügen"', async ({ browser }) => {
  const { page } = await freshSession(browser, 'pst');
  await page.goto('/library');
  await page.getByRole('button', { name: 'URL importieren' }).click();
  await page.getByLabel('Adresse der Webseite').fill('http://fixtures:8000/leer.html');
  await page.getByRole('dialog').getByRole('button', { name: 'Importieren' }).click();
  await expect(page.getByRole('dialog').getByText('nicht genug Text')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('dialog').getByRole('button', { name: 'Text einfügen' }).click();
  await page.getByRole('dialog').getByLabel('Titel').fill('Eingefügte Notiz');
  await page.getByRole('dialog').getByLabel('Text', { exact: true }).fill('Das ist der eingefügte Text. '.repeat(30));
  await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Eingefügte Notiz')).toBeVisible();
});

test('AC-1.2 invalid addresses show an error without the paste offer', async ({ browser }) => {
  const { page } = await freshSession(browser, 'inv');
  await page.goto('/library');
  await page.getByRole('button', { name: 'URL importieren' }).click();
  await page.getByLabel('Adresse der Webseite').fill('das ist keine adresse');
  await page.getByRole('dialog').getByRole('button', { name: 'Importieren' }).click();
  await expect(page.getByRole('dialog').getByText('keine gültige Adresse')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Text einfügen' })).toHaveCount(0);
});
