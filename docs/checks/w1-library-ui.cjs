// Usage: NODE_PATH=<web>/node_modules node w1ui.cjs <baseUrl> <samplesDir> <outDir>
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const [, , base, samples, out] = process.argv;
fs.mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => {
  results.push(ok);
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? `  [${extra}]` : ''));
};
fs.writeFileSync(path.join(out, 'programm.exe'), Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03]));

async function ready(page, url) {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      if (r && r.ok()) return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error('server not ready');
}
async function login(page, user, pw) {
  await ready(page, base + '/login');
  await page.getByLabel('Benutzername').fill(user);
  await page.getByLabel('Passwort').fill(pw);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page.waitForURL(base + '/');
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  let loads = 0;
  page.on('load', () => loads++);
  await login(page, 'julian', 'Test-Passw0rd-1');
  await page.getByRole('link', { name: 'Bibliothek' }).click();
  await page.waitForURL('**/library');
  await page.getByText('Noch keine Dokumente').waitFor({ timeout: 10000 }).catch(() => {});
  check('empty library shows the empty state', await page.getByText('Noch keine Dokumente').isVisible());
  await page.screenshot({ path: path.join(out, '1-empty.png') });

  const loadsBefore = loads;
  const files = ['bericht-de.pdf', 'garantie.docx', 'kurs-de.pptx', 'artikel-de.html', 'buch-de.epub'].map((f) => path.join(samples, f));
  await page.locator('input[type=file]').setInputFiles([...files, path.join(out, 'programm.exe')]);
  // watch the statuses change live (no reload)
  const seen = new Set();
  const deadline = Date.now() + 90000;
  let shotTaken = false;
  while (Date.now() < deadline) {
    const texts = await page.locator('app-status').allInnerTexts();
    texts.forEach((t) => seen.add(t.trim()));
    if (!shotTaken && texts.length >= 3) { await page.screenshot({ path: path.join(out, '2-uploading.png') }); shotTaken = true; }
    if (texts.length === 5 && texts.every((t) => t.trim() === 'Bereit')) break;
    await page.waitForTimeout(200);
  }
  const bereit = (await page.locator('app-status').allInnerTexts()).filter((t) => t.trim() === 'Bereit').length;
  check('5 mixed files upload and all reach "Bereit"', bereit === 5, `${bereit}/5, saw: ${[...seen].join(', ')}`);
  check('no page reload happened while statuses changed', loads === loadsBefore, `loads ${loadsBefore} -> ${loads}`);
  check('unsupported file shows the German reason', await page.getByText('Dieser Dateityp wird nicht unterstützt').isVisible());
  await page.screenshot({ path: path.join(out, '3-library.png') });

  await page.locator('input[type=file]').setInputFiles([files[0]]);
  await page.getByText('Bereits in deiner Bibliothek').waitFor({ timeout: 15000 });
  check('uploading the same PDF again says "Bereits in deiner Bibliothek"', true);

  await page.getByRole('searchbox', { name: 'Titel suchen' }).fill('Garantie');
  await page.waitForTimeout(900);
  check('title search narrows the list to 1', (await page.locator('ul.divide-y > li').count()) === 1);
  await page.getByRole('searchbox', { name: 'Titel suchen' }).fill('');
  await page.waitForTimeout(900);
  await page.locator('select').first().selectOption('failed');
  await page.waitForTimeout(600);
  check('status filter "Fehler" shows the no-match text', await page.getByText('Keine Dokumente gefunden.').isVisible());
  await page.locator('select').first().selectOption('');
  await page.waitForTimeout(600);

  await page.getByRole('link', { name: 'Garantiebedingungen Geschirrspüler' }).first().click();
  await page.waitForURL(/library\/[0-9a-f-]+$/);
  await page.getByRole('heading', { level: 1, name: 'Garantiebedingungen Geschirrspüler' }).waitFor();
  check('document page shows status and extracted text', (await page.getByText('Bereit').first().isVisible()) && (await page.getByText('Mieter').first().isVisible()));
  await page.screenshot({ path: path.join(out, '4-document.png'), fullPage: true });
  const href = await page.getByRole('link', { name: 'Original herunterladen' }).getAttribute('href');
  check('download link points to the original file', /\/api\/documents\/[0-9a-f-]+\/file$/.test(href || ''));

  await page.getByRole('button', { name: 'Umbenennen' }).click();
  await page.getByLabel('Titel').fill('Garantie Spülmaschine');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await page.getByRole('heading', { level: 1, name: 'Garantie Spülmaschine' }).waitFor();
  check('rename works', true);
  await page.getByLabel('Mit Haushalt teilen').check();
  await page.getByText('Gespeichert.').first().waitFor();
  check('sharing toggle works', await page.getByLabel('Mit Haushalt teilen').isChecked());

  // second person
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const dora = await ctx2.newPage();
  await login(dora, 'dora', 'Dora-Passw0rd-1');
  await dora.getByRole('link', { name: 'Bibliothek' }).click();
  await dora.waitForURL('**/library');
  await dora.getByText('Garantie Spülmaschine').waitFor();
  check('second account sees the shared document in her library', true);
  check('only the shared one is visible (private ones are not)', (await dora.locator('ul.divide-y > li').count()) === 1);
  await dora.getByText('Garantie Spülmaschine').click();
  await dora.getByRole('heading', { level: 1, name: 'Garantie Spülmaschine' }).waitFor();
  check('shared document is read-only for her (no rename, delete, share)', (await dora.getByRole('button', { name: 'Umbenennen' }).count()) === 0 && (await dora.getByRole('button', { name: 'Löschen' }).count()) === 0 && (await dora.getByLabel('Mit Haushalt teilen').count()) === 0);
  check('it says who shared it', await dora.getByText('Geteilt von Julian').first().isVisible());
  await dora.screenshot({ path: path.join(out, '5-shared-readonly.png') });

  // phone
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const phone = await ctx3.newPage();
  await login(phone, 'julian', 'Test-Passw0rd-1');
  await phone.goto(base + '/library', { waitUntil: 'networkidle' });
  await phone.screenshot({ path: path.join(out, '6-phone-library.png') });

  // delete
  await page.getByRole('button', { name: 'Löschen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await page.waitForURL('**/library');
  await page.getByText('Dokument gelöscht.').waitFor();
  check('delete with confirmation returns to the library', true);
  check('deleted document is gone from the list', (await page.getByText('Garantie Spülmaschine').count()) === 0);
  await page.getByRole('button', { name: 'Hell' }).count();

  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  await browser.close();
})().catch((e) => {
  console.error('FAILED', e.message.split('\n')[0]);
  process.exit(1);
});
