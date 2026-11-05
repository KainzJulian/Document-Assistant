import { expect, test } from '@playwright/test';
import { ask, freshSession, RENT_QUESTION, startChat, uploadSamples } from './helpers';

test('AC-3.1 / AC-3.3 a question gets a streamed, cited answer; a citation opens the passage', async ({ browser }) => {
  const { page } = await freshSession(browser, 'cht');
  await uploadSamples(page, 'notiz-de.txt');
  await startChat(page);
  const answer = page.locator('app-message').nth(1);
  await expect(answer).toContainText('Laut den Unterlagen');
  await answer.getByRole('button', { name: 'Quelle 1' }).first().click();
  await expect(page.locator('app-citation-panel')).toContainText('Mietverhältnis');
  await expect(page.locator('app-citation-panel').getByRole('link', { name: 'Dokument öffnen' })).toBeVisible();
  await page.locator('app-citation-panel').getByRole('button', { name: 'Quelle schließen' }).click();
  await expect(page.locator('app-citation-panel')).toHaveCount(0);
});

test('AC-3.1 copy and regenerate sit under the last answer', async ({ browser }) => {
  const { page } = await freshSession(browser, 'cpy');
  await uploadSamples(page, 'notiz-de.txt');
  await startChat(page);
  await expect(page.getByRole('button', { name: 'Kopieren' })).toBeVisible();
  const id = await page.locator('app-message').nth(1).locator('[id^=msg-]').getAttribute('id');
  await page.getByRole('button', { name: 'Neu generieren' }).click();
  await expect(page.locator('app-message')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Stopp' })).toHaveCount(0, { timeout: 30_000 });
  expect(await page.locator('app-message').nth(1).locator('[id^=msg-]').getAttribute('id')).not.toBe(id);
});

test('AC-3.3 a question the documents cannot answer gets the fixed sentence', async ({ browser }) => {
  const { page } = await freshSession(browser, 'nf');
  await uploadSamples(page, 'notiz-de.txt');
  await startChat(page, 'Wie heißt die Hauptstadt von Frankreich?');
  await expect(page.locator('app-message').nth(1)).toHaveText('Dazu finde ich in den ausgewählten Dokumenten nichts.');
});

test('AC-3.3 follow-ups work and the chat gets a title after the first answer', async ({ browser }) => {
  const { page } = await freshSession(browser, 'fol');
  await uploadSamples(page, 'notiz-de.txt');
  await startChat(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Fragen zu den Unterlagen');
  await ask(page, 'Und wann muss das Schreiben beim Vermieter ankommen?');
  await expect(page.locator('app-message')).toHaveCount(4);
});

test('AC-3.2 only chosen documents are searchable in the picker, and at least one is required', async ({ browser }) => {
  const { page } = await freshSession(browser, 'pick');
  await uploadSamples(page, 'notiz-de.txt', 'garantie.docx', 'readme-de.md');
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'Dokumente suchen' }).fill('Garantie');
  await expect(page.locator('app-document-picker li')).toHaveCount(1);
  await page.getByLabel('Frage an die Dokumente').fill(RENT_QUESTION);
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText('Wähle mindestens ein Dokument aus.')).toBeVisible();
  await page.locator('app-document-picker input[type=checkbox]').check();
  await expect(page.getByText('1 Dokumente ausgewählt')).toBeVisible();
});

test('AC-3.2 documents can be changed during a chat', async ({ browser }) => {
  const { page } = await freshSession(browser, 'chg');
  await uploadSamples(page, 'notiz-de.txt', 'garantie.docx');
  await page.goto('/');
  await page.locator('app-document-picker label', { hasText: 'Einkaufsliste' }).locator('input').check();
  await page.getByLabel('Frage an die Dokumente').fill(RENT_QUESTION);
  await page.getByRole('button', { name: 'Senden' }).click();
  await page.waitForURL('**/chat/**');
  await expect(page.getByRole('button', { name: 'Stopp' })).toHaveCount(0, { timeout: 30_000 });
  await page.getByRole('button', { name: 'Dokumente ändern' }).click();
  await page.getByRole('dialog').locator('label', { hasText: 'Garantiebedingungen' }).locator('input').check();
  await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
  await expect(page.locator('header').getByRole('link', { name: 'Garantiebedingungen Geschirrspüler' })).toBeVisible();
});

test('AC-4.1 messages are saved: a reload shows the whole chat, also after an interrupted answer', async ({ browser }) => {
  const { page } = await freshSession(browser, 'sav');
  await uploadSamples(page, 'notiz-de.txt');
  await startChat(page);
  await page.reload();
  await expect(page.locator('app-message')).toHaveCount(2);
  await expect(page.locator('app-message').nth(1)).toContainText('Laut den Unterlagen');
});

test('AC-3.1 the person can start a chat from a document page', async ({ browser }) => {
  const { page } = await freshSession(browser, 'fromdoc');
  await uploadSamples(page, 'notiz-de.txt');
  await page.getByRole('link', { name: 'Einkaufsliste und Notizen' }).first().click();
  await page.getByRole('link', { name: 'Chat mit diesem Dokument' }).click();
  await expect(page.getByText('1 Dokumente ausgewählt')).toBeVisible();
});
