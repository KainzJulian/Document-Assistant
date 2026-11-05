// Usage: NODE_PATH=<web>/node_modules node flow.cjs <baseUrl> <outDir>
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
const suffix = Date.now().toString(36);
const member = { user: `bea${suffix}`, name: 'Bea Test', pw: 'Bea-Passw0rd-1', pw2: 'Bea-Neu-Passw0rd-2' };

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

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  await ready(page, base + '/');
  await page.waitForURL('**/login');
  check('unauthenticated visit is redirected to /login', page.url().endsWith('/login'));
  await page.screenshot({ path: path.join(out, '1-login.png') });

  await page.getByLabel('Benutzername').fill('julian');
  await page.getByLabel('Passwort').fill('falsches-passwort');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page.getByRole('alert').waitFor();
  check('wrong password shows the German error', (await page.getByRole('alert').innerText()).includes('Benutzername oder Passwort ist falsch'));
  await page.screenshot({ path: path.join(out, '2-login-error.png') });

  await page.getByLabel('Benutzername').fill('julian');
  await page.getByLabel('Passwort').fill('Test-Passw0rd-1');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page.waitForURL(base + '/');
  check('login lands on the start page', page.url() === base + '/');
  check('sidebar shows the user name', await page.getByText('Julian', { exact: true }).first().isVisible());
  check('admin sees the "Benutzer" entry', await page.getByRole('link', { name: 'Benutzer' }).isVisible());
  const sidebarWidth = await page.locator('aside').evaluate((el) => Math.round(el.getBoundingClientRect().width));
  check('sidebar is 280 px wide on desktop', sidebarWidth === 280, sidebarWidth + ' px');
  await page.screenshot({ path: path.join(out, '3-home.png') });

  await page.reload({ waitUntil: 'networkidle' });
  check('still logged in after reload (cookie persists)', page.url() === base + '/' && (await page.getByText('Julian', { exact: true }).first().isVisible()));

  await page.getByRole('link', { name: 'Benutzer' }).click();
  await page.waitForURL('**/admin');
  await page.getByLabel('Benutzername').fill(member.user);
  await page.getByLabel('Anzeigename').fill(member.name);
  await page.getByLabel('Passwort', { exact: true }).fill('kurz');
  await page.getByRole('button', { name: 'Benutzer anlegen' }).click();
  await page.waitForSelector('text=Mindestens 8 Zeichen', { timeout: 5000 }).catch(() => {});
  const shortErr = await page.locator('#app-input-4-error, [id$="-error"]').first().innerText().catch(() => '');
  check('short password is rejected with a German message', shortErr.length > 0, shortErr);
  await page.getByLabel('Passwort', { exact: true }).fill(member.pw);
  await page.getByRole('button', { name: 'Benutzer anlegen' }).click();
  await page.getByText('Benutzer angelegt.').waitFor();
  check('admin creates a member (toast shown)', true);
  check('new member appears in the list', await page.getByText(member.name).first().isVisible());
  await page.screenshot({ path: path.join(out, '4-admin.png') });

  const row = page.locator('li', { hasText: member.user });
  await row.getByRole('button', { name: 'Passwort zurücksetzen' }).click();
  await page.getByRole('dialog').waitFor();
  await page.screenshot({ path: path.join(out, '5-admin-dialog.png') });
  await page.getByRole('dialog').getByLabel('Neues Passwort').fill(member.pw2);
  await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
  await page.getByText('Passwort geändert.').waitFor();
  check('password reset dialog works', true);

  // second device: a member
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const phone = await ctx2.newPage();
  await ready(phone, base + '/login');
  await phone.getByLabel('Benutzername').fill(member.user);
  await phone.getByLabel('Passwort').fill(member.pw);
  await phone.getByRole('button', { name: 'Anmelden' }).click();
  await phone.getByRole('alert').waitFor();
  check('old password no longer works after reset', true);
  await phone.getByLabel('Passwort').fill(member.pw2);
  await phone.getByRole('button', { name: 'Anmelden' }).click();
  await phone.waitForURL(base + '/');
  check('member logs in on a second device (phone width)', true);
  check('member does not see "Benutzer"', (await phone.getByRole('link', { name: 'Benutzer' }).count()) === 0);
  const hidden = await phone.locator('aside').evaluate((el) => getComputedStyle(el).visibility);
  check('sidebar is hidden on the phone until the menu is opened', hidden === 'hidden', hidden);
  await phone.screenshot({ path: path.join(out, '6-phone-home.png') });
  await phone.getByRole('button', { name: 'Menü' }).click();
  await phone.waitForTimeout(400);
  check('drawer opens with the menu button', (await phone.locator('aside').evaluate((el) => getComputedStyle(el).visibility)) === 'visible');
  await phone.screenshot({ path: path.join(out, '7-phone-drawer.png') });
  await phone.keyboard.press('Escape');
  await phone.waitForTimeout(400);
  check('Esc closes the drawer', (await phone.locator('aside').evaluate((el) => getComputedStyle(el).visibility)) === 'hidden');
  await phone.goto(base + '/admin', { waitUntil: 'networkidle' });
  check('member opening /admin is sent back to /', phone.url() === base + '/');

  // dark theme persists
  await page.getByRole('button', { name: 'Dunkel' }).click();
  check('dark theme turns on', await page.evaluate(() => document.documentElement.classList.contains('dark')));
  await page.reload({ waitUntil: 'networkidle' });
  check('dark theme survives a reload', await page.evaluate(() => document.documentElement.classList.contains('dark')));
  await page.screenshot({ path: path.join(out, '8-dark-admin.png') });
  await page.getByRole('button', { name: 'Hell' }).click();

  // lockout on a fresh context
  const ctx3 = await browser.newContext();
  const lock = await ctx3.newPage();
  await ready(lock, base + '/login');
  const attempt = async (pw) => {
    await lock.getByLabel('Benutzername').fill(member.user);
    await lock.getByLabel('Passwort').fill(pw);
    const [res] = await Promise.all([
      lock.waitForResponse((r) => r.url().includes('/api/auth/login')),
      lock.getByRole('button', { name: 'Anmelden' }).click(),
    ]);
    await lock.waitForFunction(() => !document.querySelector('button[aria-busy]'));
    return res.status();
  };
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push(await attempt('falsch-' + i));
  check('5 wrong passwords answer 401', codes.every((c) => c === 401), codes.join(','));
  const sixth = await attempt(member.pw2);
  check('6th attempt with the RIGHT password is locked (429)', sixth === 429, String(sixth));
  check('lock message is shown in German', (await lock.getByRole('alert').innerText()).includes('Fehlversuche'));
  await lock.screenshot({ path: path.join(out, '9-locked.png') });

  // logout
  await page.getByRole('button', { name: 'Abmelden' }).click();
  await page.waitForURL('**/login');
  check('logout returns to /login', true);
  await page.goto(base + '/library', { waitUntil: 'networkidle' });
  check('after logout /library redirects to /login', page.url().endsWith('/login'));

  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  await browser.close();
})().catch((e) => {
  console.error('FAILED', e.message.split('\n')[0]);
  process.exit(1);
});
