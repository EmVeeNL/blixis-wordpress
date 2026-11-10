// Task 03-05 browser stage: stored tokens on the public site, the draft preview and its widths,
// preview security, save without stale output, and rollback.
// Prints PASS/FAIL/NOTE lines and ends with DONE-BROWSER.
import { chromium, firefox } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:8080';
const WIZARD = `${BASE}/wp-admin/themes.php?page=blixis-setup`;
const PASSWORD = process.env.T0305_ADMIN_PASSWORD;
const AXE = readFileSync('vendor/axe.min.js', 'utf8');
const ENGINES = { chromium, firefox };
const GREEN = '#0a7a3f';
const RED = '#b42318';

let fails = 0;
let current = '';
const check = (name, ok, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} [${current}] ${name}${!ok && detail ? ' -- ' + String(detail).slice(0, 600).replace(/\n/g, ' | ') : ''}`);
};
const note = (name, value) => console.log(`NOTE [${current}] ${name}: ${String(value).slice(0, 400)}`);
mkdirSync('shots', { recursive: true });

async function login(browser, user, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  // Firefox in CI occasionally stalls on the login submit (seen on main at 696263b). Wait for the
  // full load, and retry once, reporting what the login page said; same helper as 03-03.
  for (let attempt = 1; ; attempt++) {
    await page.goto(`${BASE}/wp-login.php?redirect_to=${encodeURIComponent(WIZARD)}`, { waitUntil: 'load' });
    await page.fill('#user_login', user);
    await page.fill('#user_pass', PASSWORD);
    try {
      await Promise.all([page.waitForURL((url) => url.pathname.startsWith('/wp-admin/'), { timeout: 30000, waitUntil: 'commit' }), page.click('#wp-submit')]);
      return { context, page };
    } catch (error) {
      const said = await page.locator('#login_error').innerText().catch(() => '(no login error shown)');
      note(`login attempt ${attempt} for ${user} did not reach wp-admin`, said);
      if (attempt === 2) throw error;
    }
  }
}

async function axe(page, label) {
  await page.addScriptTag({ content: AXE });
  const result = await page.evaluate(async () => {
    const r = await window.axe.run({ include: ['.blixis-setup'] }, { resultTypes: ['violations'] });
    return r.violations.map((v) => `${v.id}(${v.nodes.length}) ${v.nodes[0]?.target}`);
  });
  check(`axe-core finds no violations: ${label}`, result.length === 0, result.join(' || '));
}

// Token values as a page sees them.
const tokens = (frameOrPage) =>
  frameOrPage.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return {
      blixis: root.getPropertyValue('--blixis-color-primary').trim().toLowerCase(),
      preset: root.getPropertyValue('--wp--preset--color--primary').trim().toLowerCase(),
      bodyFont: getComputedStyle(document.body).fontFamily,
      headingFont: getComputedStyle(document.querySelector('h1')).fontFamily,
      spacing: root.getPropertyValue('--wp--preset--spacing--md').trim(),
      robots: document.querySelector('meta[name="robots"]')?.content ?? '',
    };
  });

async function publicTokens(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  const values = await tokens(page);
  const font = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Liberation Sans');
  });
  const starter = await page.evaluate(() => ({
    mainCount: document.querySelectorAll('main').length,
    headingCount: document.querySelectorAll('main h1').length,
    hasIntro: document.querySelector('main')?.innerText.includes('A better way to do business') ?? false,
  }));
  await context.close();
  return { ...values, font, starter, external: requests.filter((u) => !u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith(`blob:${BASE}`)) };
}

async function capturePublicPage(browser, url, width, filename) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'load' });
  await page.screenshot({ path: `shots/${filename}`, fullPage: true });
  await context.close();
}

async function starterResponsive(browser) {
  for (const width of [320, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    const result = await page.evaluate(() => ({
      mainCount: document.querySelectorAll('main').length,
      headingCount: document.querySelectorAll('main h1').length,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    }));
    check(`neutral starter has semantic content and fits at ${width}px with reduced motion`, result.mainCount === 1 && result.headingCount === 1 && !result.overflow && result.reducedMotion, JSON.stringify(result));
    await context.close();
  }
}

async function fullFlow(browser) {
  let pub = await publicTokens(browser);
  check('visitors get the stored colour in the token stylesheet', pub.blixis === GREEN, JSON.stringify(pub));
  check('visitors get the stored colour as the WordPress preset, despite a Site Editor override', pub.preset === GREEN, JSON.stringify(pub));
  check('fresh generated child renders the Business layout (starter neutral)', pub.starter.mainCount === 1 && pub.starter.headingCount === 1 && pub.starter.hasIntro, JSON.stringify(pub.starter));
  check('the generated child renders the configured body font', pub.bodyFont.includes('Liberation Sans'), pub.bodyFont);
  check('the generated child renders the configured heading font', pub.headingFont.includes('Georgia'), pub.headingFont);
  check('the generated child receives the configured spacing preset', pub.spacing === '2rem', pub.spacing);
  await starterResponsive(browser);
  check('the stored Font Library font is declared for visitors', pub.font);
  check('no visitor request leaves the site', pub.external.length === 0, pub.external.join(' '));

  const { context, page } = await login(browser, 'fixture_admin');
  await page.goto(`${WIZARD}&step=colors`);
  check('the wizard starts from the stored colour', (await page.inputValue('#blixis-colors-primary')) === GREEN);
  await page.fill('#blixis-colors-primary', RED);
  await page.click('.blixis-setup-actions button[value="next"]');
  await page.waitForLoadState('load');
  await page.goto(`${WIZARD}&step=review`);

  const frame = page.frameLocator('.blixis-setup-frame iframe');
  await frame.locator('body').waitFor();
  const handle = await page.$('.blixis-setup-frame iframe');
  const preview = await tokens(await handle.contentFrame());
  check('the preview shows the draft colour', preview.blixis === RED && preview.preset === RED, JSON.stringify(preview));
  check('the preview page is marked noindex', preview.robots.includes('noindex'), preview.robots);
  pub = await publicTokens(browser);
  check('visitors still see the stored colour while a draft exists', pub.blixis === GREEN && pub.preset === GREEN, JSON.stringify(pub));

  // The frame keeps its device width and is scaled to fit its column, so the layout width is the one to read.
  const width = async () => (await handle.evaluate((el) => el.offsetWidth));
  check('the preview starts at the mobile width (390 px)', Math.abs((await width()) - 392) <= 3, String(await width()));
  await page.click('label[for="blixis-preview-tablet"]');
  check('the tablet width sets the frame to 820 px', Math.abs((await width()) - 822) <= 3, String(await width()));
  await page.focus('#blixis-preview-tablet');
  await page.keyboard.press('ArrowRight');
  check('arrow keys move to the desktop width (1280 px)', Math.abs((await width()) - 1282) <= 3, String(await width()));
  check('the stored draft colour is unchanged by width controls', (await tokens(await handle.contentFrame())).blixis === RED);
  await axe(page, 'review step with preview at 1280px');
  await page.screenshot({ path: 'shots/review-preview-1280.png', fullPage: true });

  // Preview security.
  const src = await handle.getAttribute('src');
  const own = await page.request.get(src);
  const cache = own.headers()['cache-control'] ?? '';
  check('preview responses are not cacheable', cache.includes('no-store'), cache);
  check('preview responses are not indexable', (own.headers()['x-robots-tag'] ?? '').includes('noindex'), JSON.stringify(own.headers()));
  const anonymous = await browser.newContext();
  const anonPage = await anonymous.newPage();
  await anonPage.goto(src);
  const anon = await tokens(anonPage);
  check('an anonymous visitor with a preview link sees the stored colour, not the draft', anon.blixis === GREEN && !anon.robots.includes('noindex'), JSON.stringify(anon));
  await anonymous.close();
  const editor = await login(browser, 'fixture_editor');
  await editor.page.goto(src);
  const ed = await tokens(editor.page);
  check('an editor with a preview link sees the stored colour, not the draft', ed.blixis === GREEN, JSON.stringify(ed));
  await editor.context.close();
  const other = await login(browser, 'fixture_admin2');
  await other.page.goto(src);
  const ot = await tokens(other.page);
  check("another administrator never sees this administrator's draft through the link", ot.blixis === GREEN, JSON.stringify(ot));
  await other.context.close();
  const forged = await page.context().newPage();
  await forged.goto(`${BASE}/?blixis_preview=0123456789`);
  const fg = await tokens(forged);
  check('a preview link with an invalid nonce shows the stored colour, even to the draft owner', fg.blixis === GREEN && !fg.robots.includes('noindex'), JSON.stringify(fg));
  await forged.close();

  // Save, then roll back.
  await page.click('.blixis-setup-actions button[value="save"]');
  await page.waitForLoadState('load');
  check('saving reports revision 6', (await page.locator('.blixis-setup-notice').innerText()).includes('revision 6'));
  pub = await publicTokens(browser);
  check('visitors see the new colour at once after saving', pub.blixis === RED && pub.preset === RED, JSON.stringify(pub));
  await capturePublicPage(browser, `${BASE}/`, 1280, 'child-neutral-starter-tokens-1280.png');
  await capturePublicPage(browser, `${BASE}/`, 320, 'child-neutral-starter-tokens-320.png');
  await capturePublicPage(browser, `${BASE}/?t0305_no_tokens=1`, 1280, 'child-neutral-starter-default-1280.png');
  const rollback = page.locator('button[value="rollback"]');
  check('a rollback button is offered when a previous config exists', (await rollback.count()) === 1);
  await rollback.click();
  await page.waitForLoadState('load');
  check('rollback reports revision 7', (await page.locator('.blixis-setup-notice').innerText()).includes('revision 7'));
  pub = await publicTokens(browser);
  check('visitors see the previous colour at once after rollback', pub.blixis === GREEN && pub.preset === GREEN, JSON.stringify(pub));
  await context.close();
}

async function readOnlyChecks(browser, label) {
  const narrow = await login(browser, 'fixture_admin', { width: 320, height: 800 });
  await narrow.page.goto(`${WIZARD}&step=review`);
  await axe(narrow.page, `review step at 320px (${label})`);
  const fits = await narrow.page.evaluate(() => document.querySelector('.blixis-setup').getBoundingClientRect().right <= document.documentElement.clientWidth + 1);
  check('the review step fits at 320px (the preview frame scrolls inside its box)', fits);
  await narrow.page.screenshot({ path: `shots/review-320-${label}.png`, fullPage: true });
  await narrow.context.close();
  const pub = await publicTokens(browser);
  check(`visitors see the stored colour (${label})`, pub.blixis === GREEN && pub.preset === GREEN, JSON.stringify(pub));
}

const names = (process.env.T0305_BROWSERS || 'chromium').split(',').filter(Boolean);
for (const [index, name] of names.entries()) {
  current = name;
  let browser;
  try {
    browser = await ENGINES[name].launch();
  } catch (error) {
    console.log(`HARNESS browser ${name} did not start: ${error.message}`);
    continue;
  }
  try {
    if (index === 0) await fullFlow(browser);
    await readOnlyChecks(browser, name);
  } catch (error) {
    check('browser flow completed without an exception', false, error.stack || error.message);
  }
  await browser.close();
}
note('result', `${fails} failed`);
console.log(`DONE-BROWSER ${names.join(',')}`);
process.exit(fails ? 1 : 0);
