// Usage: NODE_PATH=<web>/node_modules node w2ui.cjs <baseUrl> <outDir>
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const [, , base, out] = process.argv;
fs.mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => {
  results.push(ok);
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? `  [${extra}]` : ''));
};
(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  for (let i = 0; i < 60; i++) { try { const r = await page.goto(base + '/login', { waitUntil: 'networkidle', timeout: 15000 }); if (r && r.ok()) break; } catch { await new Promise((r) => setTimeout(r, 1000)); } }
  await page.getByLabel('Benutzername').fill('julian');
  await page.getByLabel('Passwort').fill('Test-Passw0rd-1');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page.waitForURL(base + '/');
  await page.goto(base + '/library', { waitUntil: 'networkidle' });

  // 1. a normal page
  await page.getByRole('button', { name: 'URL importieren' }).click();
  await page.getByRole('dialog').waitFor();
  await page.getByLabel('Adresse der Webseite').fill('https://danluu.com/hardware-unforgiving/?utm_source=test#top');
  await page.getByRole('dialog').getByRole('button', { name: 'Importieren' }).click();
  await page.getByText('Wird gelesen.').first().waitFor({ timeout: 30000 });
  check('importing a page closes the dialog and shows a message', (await page.getByRole('dialog').count()) === 0 || !(await page.getByRole('dialog').isVisible()));
  await page.getByText('Why hardware development is hard').waitFor({ timeout: 30000 });
  await page.locator('app-status', { hasText: 'Bereit' }).first().waitFor({ timeout: 30000 });
  check('the page appears in the library and becomes "Bereit"', true);

  // 2. same page again
  await page.getByRole('button', { name: 'URL importieren' }).click();
  await page.getByLabel('Adresse der Webseite').fill('https://DANLUU.com/hardware-unforgiving');
  await page.getByRole('dialog').getByRole('button', { name: 'Importieren' }).click();
  await page.getByText('Bereits in deiner Bibliothek').first().waitFor({ timeout: 30000 });
  check('the same page again says "Bereits in deiner Bibliothek"', true);

  // 3. unreadable page -> reason + offer to paste
  await page.getByRole('button', { name: 'URL importieren' }).click();
  await page.getByLabel('Adresse der Webseite').fill('https://x.com/');
  await page.getByRole('dialog').getByRole('button', { name: 'Importieren' }).click();
  await page.getByRole('dialog').getByText('nicht genug Text').waitFor({ timeout: 30000 });
  check('an unreadable page shows the German reason', true);
  check('and offers "Text einfügen"', await page.getByRole('dialog').getByRole('button', { name: 'Text einfügen' }).isVisible());
  await page.screenshot({ path: path.join(out, '1-failed.png') });
  await page.getByRole('dialog').getByRole('button', { name: 'Text einfügen' }).click();
  check('the title is suggested from the address', (await page.getByRole('dialog').getByLabel('Titel').inputValue()) === 'x.com');
  await page.getByRole('dialog').getByLabel('Titel').fill('Notizen von x.com');
  await page.getByRole('dialog').getByLabel('Text', { exact: true }).fill('Das ist der eingefügte Text. '.repeat(20));
  await page.screenshot({ path: path.join(out, '2-paste.png') });
  await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
  await page.getByText('Notizen von x.com').waitFor({ timeout: 30000 });
  check('pasted text becomes a document', true);

  // 4. invalid address: error but no paste offer
  await page.getByRole('button', { name: 'URL importieren' }).click();
  await page.getByLabel('Adresse der Webseite').fill('das ist keine adresse');
  await page.getByRole('dialog').getByRole('button', { name: 'Importieren' }).click();
  await page.getByRole('dialog').getByText('keine gültige Adresse').waitFor({ timeout: 10000 });
  check('an invalid address shows its error without offering paste', (await page.getByRole('dialog').getByRole('button', { name: 'Text einfügen' }).count()) === 0);
  await page.keyboard.press('Escape');

  // 5. blocked internal address
  await page.getByRole('button', { name: 'URL importieren' }).click();
  await page.getByLabel('Adresse der Webseite').fill('http://db:5432/');
  await page.getByRole('dialog').getByRole('button', { name: 'Importieren' }).click();
  await page.getByRole('dialog').getByText('darf nicht abgerufen werden').waitFor({ timeout: 10000 });
  check('an internal address is refused', true);
  await page.keyboard.press('Escape');

  // 6. type filter and URL on document page
  await page.locator('select').nth(1).selectOption('url');
  await page.waitForTimeout(800);
  check('type filter "Link" shows only the imported page', (await page.locator('ul.divide-y > li').count()) === 1);
  await page.getByText('Why hardware development is hard').click();
  await page.getByRole('link', { name: 'https://danluu.com/hardware-unforgiving' }).waitFor();
  check('document page shows the source address', true);
  await page.screenshot({ path: path.join(out, '3-url-document.png') });

  // cleanup through the API so the next runs start clean
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  await browser.close();
})().catch((e) => { console.error('FAILED', e.message.split('\n')[0]); process.exit(1); });
