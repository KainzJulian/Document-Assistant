import path from 'node:path';
import { expect, test } from '@playwright/test';
import { freshSession, loginAs, SAMPLES, uploadSamples } from './helpers';

const MIXED = ['bericht-de.pdf', 'garantie.docx', 'kurs-de.pptx', 'artikel-de.html', 'buch-de.epub', 'notiz-de.txt', 'readme-de.md'];

test('AC-1.1 seven file types upload together and reach "Bereit"; unsupported files get a German reason', async ({ browser }) => {
  const { page } = await freshSession(browser, 'upl');
  await page.goto('/library');
  await expect(page.getByText('Noch keine Dokumente')).toBeVisible();
  const files = MIXED.map((f) => path.join(SAMPLES, f));
  await page.locator('input[type=file]').setInputFiles([
    ...files,
    { name: 'programm.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ\0\0'.repeat(100)) },
  ]);
  await expect(page.locator('app-status', { hasText: 'Bereit' })).toHaveCount(MIXED.length, { timeout: 90_000 });
  await expect(page.getByText('Dieser Dateityp wird nicht unterstützt')).toBeVisible();
});

test('AC-1.1 a file without text fails with a readable message', async ({ browser }) => {
  const { page } = await freshSession(browser, 'scan');
  await page.goto('/library');
  const emptyPdf = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF';
  await page.locator('input[type=file]').setInputFiles({ name: 'scan.pdf', mimeType: 'application/pdf', buffer: Buffer.from(emptyPdf) });
  await expect(page.locator('app-status', { hasText: 'Fehler' })).toBeVisible({ timeout: 60_000 });
});

test('AC-1.3 uploads appear without a save step and duplicates are detected', async ({ browser }) => {
  const { page } = await freshSession(browser, 'dup');
  let loads = 0;
  page.on('load', () => loads++);
  await uploadSamples(page, 'garantie.docx');
  const before = loads;
  await page.locator('input[type=file]').setInputFiles(path.join(SAMPLES, 'garantie.docx'));
  await expect(page.getByText('Bereits in deiner Bibliothek')).toBeVisible();
  expect(loads).toBe(before);
  await expect(page.locator('ul.divide-y > li')).toHaveCount(1);
});

test('AC-1.3 title search, type and status filters', async ({ browser }) => {
  const { page } = await freshSession(browser, 'flt');
  await uploadSamples(page, 'garantie.docx', 'notiz-de.txt');
  await page.getByRole('searchbox', { name: 'Titel suchen' }).fill('Garantie');
  await expect(page.locator('ul.divide-y > li')).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Titel suchen' }).fill('');
  await page.locator('select').first().selectOption('failed');
  await expect(page.getByText('Keine Dokumente gefunden.')).toBeVisible();
});

test('AC-1.4 documents stay after logout and on another device', async ({ browser }) => {
  const { page, person } = await freshSession(browser, 'per');
  await uploadSamples(page, 'notiz-de.txt');
  await page.getByRole('button', { name: 'Abmelden' }).click();
  await page.waitForURL('**/login');
  await loginAs(page, person);
  await page.goto('/library');
  await expect(page.getByText('Einkaufsliste und Notizen')).toBeVisible();

  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await loginAs(phone, person);
  await phone.goto('/library');
  await expect(phone.getByText('Einkaufsliste und Notizen')).toBeVisible();
});

test('AC-1.1 document page: text, download link, rename, share, delete', async ({ browser }) => {
  const { page } = await freshSession(browser, 'doc');
  await uploadSamples(page, 'garantie.docx');
  await page.getByRole('link', { name: 'Garantiebedingungen Geschirrspüler' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Garantiebedingungen Geschirrspüler' })).toBeVisible();
  const href = await page.getByRole('link', { name: 'Original herunterladen' }).getAttribute('href');
  expect(href).toMatch(/\/api\/documents\/[0-9a-f-]+\/file$/);
  await page.getByRole('button', { name: 'Umbenennen' }).click();
  await page.getByLabel('Titel').fill('Garantie Spülmaschine');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Garantie Spülmaschine' })).toBeVisible();
  await page.getByLabel('Mit Haushalt teilen').check();
  await expect(page.getByText('Gespeichert.').first()).toBeVisible();
  await page.getByRole('button', { name: 'Löschen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await page.waitForURL('**/library');
  await expect(page.getByText('Noch keine Dokumente')).toBeVisible();
});
