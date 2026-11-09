import { expect, test } from '@playwright/test';
import { freshSession, uploadSamples } from './helpers';

const LENGTHS: [string, number][] = [
  ['Extra kurz', 50],
  ['Kurz', 150],
  ['Mittel', 300],
  ['Lang', 600],
  ['Extra lang', 1200],
];

test('AC-2.2 five labelled lengths with word targets are offered before generating', async ({ browser }) => {
  const { page } = await freshSession(browser, 'len');
  await uploadSamples(page, 'notiz-de.txt');
  await page.getByRole('link', { name: 'Einkaufsliste und Notizen' }).first().click();
  const group = page.getByRole('radiogroup', { name: 'Länge der Zusammenfassung' });
  for (const [label, words] of LENGTHS) {
    await expect(group.getByRole('radio', { name: new RegExp(`${label}\\s*${words} Wörter`) })).toBeVisible();
  }
});

test('AC-2.1 / AC-2.2 a summary streams in, is saved, and is capped for a short source', async ({ browser }) => {
  const { page } = await freshSession(browser, 'sum');
  await uploadSamples(page, 'notiz-de.txt');
  await page.getByRole('link', { name: 'Einkaufsliste und Notizen' }).first().click();
  await page.getByRole('radio', { name: /Extra lang/ }).click();
  await page.getByRole('button', { name: 'Zusammenfassen' }).click();
  await expect(page.getByText('Quelle ist kurz')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Neu erstellen' })).toBeVisible();

  await page.reload();
  await page.getByRole('radio', { name: /Extra lang/ }).click();
  await expect(page.getByText('Quelle ist kurz')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Als Chat fortsetzen' })).toBeVisible();
});

test('AC-2.1 another person can summarise a shared document', async ({ browser }) => {
  const owner = await freshSession(browser, 'own');
  await uploadSamples(owner.page, 'notiz-de.txt');
  await owner.page.getByRole('link', { name: 'Einkaufsliste und Notizen' }).first().click();
  await owner.page.getByLabel('Mit Haushalt teilen').check();
  await expect(owner.page.getByText('Gespeichert.').first()).toBeVisible();

  const guest = await freshSession(browser, 'gst');
  await guest.page.goto('/library');
  await guest.page.getByRole('link', { name: 'Einkaufsliste und Notizen' }).first().click();
  await guest.page.getByRole('radio', { name: /Kurz/ }).first().click();
  await guest.page.getByRole('button', { name: 'Zusammenfassen' }).click();
  await expect(guest.page.getByRole('button', { name: 'Neu erstellen' })).toBeVisible({ timeout: 30_000 });
});
