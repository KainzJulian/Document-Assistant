import { expect, test } from '@playwright/test';
import { freshSession, startChat, uploadSamples } from './helpers';

test('AC-5.1 the sidebar is always visible on a desktop and a drawer on a phone', async ({ browser }) => {
  const { page } = await freshSession(browser, 'nav');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/library');
  await expect(page.getByLabel('Seitenleiste')).toBeVisible();

  await page.setViewportSize({ width: 1023, height: 800 });
  await expect(page.getByLabel('Seitenleiste')).toBeHidden();
  await page.getByRole('button', { name: 'Menü' }).click();
  await expect(page.getByLabel('Seitenleiste')).toBeVisible();
  await page.getByRole('link', { name: 'Einstellungen' }).click();
  await page.waitForURL('**/settings');
  await expect(page.getByLabel('Seitenleiste')).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Menü' }).click();
  await expect(page.getByLabel('Seitenleiste')).toBeVisible();
  await page.keyboard.press('Escape');
});

test('AC-5.2 one click switches between the sections and a typed question is kept', async ({ browser }) => {
  const { page } = await freshSession(browser, 'sw');
  await uploadSamples(page, 'notiz-de.txt');
  await startChat(page);
  await page.getByLabel('Frage an die Dokumente').fill('Noch nicht abgeschickt');
  await page.getByRole('link', { name: 'Bibliothek' }).click();
  await page.waitForURL('**/library');
  await page.getByRole('link', { name: 'Einstellungen' }).click();
  await page.waitForURL('**/settings');
  await page.getByRole('navigation', { name: 'Chats' }).getByRole('button').first().click();
  await page.waitForURL('**/chat/**');
  await expect(page.getByLabel('Frage an die Dokumente')).toHaveValue('Noch nicht abgeschickt');
  await page.getByRole('link', { name: 'Neuer Chat' }).click();
  await page.waitForURL(/\/$/);
});

test('AC-5.3 chats are listed by date, resumed, renamed and deleted', async ({ browser }) => {
  const { page } = await freshSession(browser, 'mng');
  await uploadSamples(page, 'notiz-de.txt');
  await startChat(page);
  const list = page.getByRole('navigation', { name: 'Chats' });
  await expect(list.getByRole('heading', { name: 'Heute' })).toBeVisible();

  await page.goto('/library');
  await list.getByRole('button').first().click();
  await page.waitForURL('**/chat/**');
  await expect(page.locator('app-message')).toHaveCount(2);

  const row = list.locator('li').first();
  await row.hover();
  await row.getByRole('button', { name: 'Umbenennen' }).click();
  await page.getByRole('dialog').getByRole('textbox').fill('Mein Mietchat');
  await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
  await expect(list.getByRole('button', { name: 'Mein Mietchat' })).toBeVisible();

  await row.hover();
  await row.getByRole('button', { name: 'Löschen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await expect(page.getByText('Noch keine Chats.').first()).toBeVisible();
});
