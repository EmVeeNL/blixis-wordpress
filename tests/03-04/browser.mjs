// Task 03-04 browser stage: Font Library uploads through WordPress's own REST routes, the
// wizard's font choices and licence table, and font loading on a public page.
// Prints PASS/FAIL/NOTE lines and ends with DONE-BROWSER.
import { chromium, firefox } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:8080';
const WIZARD = `${BASE}/wp-admin/themes.php?page=blixis-setup`;
const PASSWORD = process.env.T0304_ADMIN_PASSWORD;
const AXE = readFileSync('vendor/axe.min.js', 'utf8');
const TTF = readFileSync('fonts/LiberationSans-Regular.ttf');
const ENGINES = { chromium, firefox };

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
  // Match the path: the login URL itself contains wp-admin in its redirect_to parameter.
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

const restNonce = async (page) => (await (await page.request.get(`${BASE}/wp-admin/admin-ajax.php?action=rest-nonce`)).text()).trim();

async function upload(page, nonce, slug, name, file) {
  const family = await page.request.post(`${BASE}/?rest_route=/wp/v2/font-families`, {
    headers: { 'X-WP-Nonce': nonce },
    multipart: { font_family_settings: JSON.stringify({ name, slug, fontFamily: `"${name}", sans-serif` }) },
  });
  if (family.status() !== 201) return { family: family.status(), face: 0, body: await family.text() };
  const id = (await family.json()).id;
  const face = await page.request.post(`${BASE}/?rest_route=/wp/v2/font-families/${id}/font-faces`, {
    headers: { 'X-WP-Nonce': nonce },
    multipart: {
      font_face_settings: JSON.stringify({ fontFamily: name, fontWeight: '400', fontStyle: 'normal', src: 'file-0-0' }),
      'file-0-0': file,
    },
  });
  return { family: family.status(), face: face.status(), body: await face.text() };
}

async function fullFlow(browser) {
  const { context, page } = await login(browser, 'fixture_admin');
  const nonce = await restNonce(page);
  check('an administrator gets a REST nonce', /^[0-9a-f]{10}$/.test(nonce), nonce);

  const good = await upload(page, nonce, 'upload-sans', 'Upload Sans', { name: 'upload-sans.ttf', mimeType: 'font/ttf', buffer: TTF });
  check('the Font Library accepts a valid TrueType upload', good.family === 201 && good.face === 201, JSON.stringify(good).slice(0, 300));
  const evil = await upload(page, nonce, 'upload-evil', 'Upload Evil', { name: 'upload-evil.woff2', mimeType: 'font/woff2', buffer: Buffer.from("<?php echo 'x';") });
  check('the Font Library refuses a PHP file named .woff2', evil.face >= 400 && evil.face < 500, JSON.stringify(evil).slice(0, 300));
  const php = await upload(page, nonce, 'upload-evil-php', 'Upload Evil Php', { name: 'upload-evil.php', mimeType: 'application/x-php', buffer: Buffer.from("<?php echo 'x';") });
  check('the Font Library refuses a .php upload', php.face >= 400 && php.face < 500, JSON.stringify(php).slice(0, 300));
  await context.close();

  const editor = await login(browser, 'fixture_editor');
  const editorNonce = await restNonce(editor.page);
  const denied = await upload(editor.page, editorNonce, 'editor-font', 'Editor Font', { name: 'editor.ttf', mimeType: 'font/ttf', buffer: TTF });
  check('an editor cannot add fonts (403)', denied.family === 403, JSON.stringify(denied).slice(0, 200));
  await editor.context.close();

  // The wizard: choose a theme first, then the font step.
  const admin = await login(browser, 'fixture_admin');
  const p = admin.page;
  await p.goto(WIZARD);
  await p.fill('#blixis-theme-name', 'Font Site');
  await p.fill('#blixis-theme-slug', 'font-site');
  await p.click('.blixis-setup-actions button[value="next"]');
  await p.waitForLoadState('load');
  await p.goto(`${WIZARD}&step=typography`);
  const options = await p.locator('select[name="config[fonts][body]"] option').allTextContents();
  check('the body font offers usable installed families', options.includes('Liberation Sans') && options.includes('Upload Sans'), options.join(','));
  check('unusable families are not offered', !options.includes('Broken Font') && !options.includes('Remote Font') && !options.includes('Bad;Name'), options.join(','));
  check('generic families are offered', options.includes('system-ui') && options.includes('serif'), options.join(','));
  const table = await p.locator('.blixis-setup-fonts').innerText();
  check('the installed fonts table shows the licence from the font file', table.includes('Open Font License'), table.slice(0, 300));
  check('the installed fonts table explains why a family cannot be used', table.includes('Cannot be used'), table.slice(0, 300));
  await axe(p, 'typography step with installed fonts at 1280px');
  await p.screenshot({ path: 'shots/typography-1280.png', fullPage: true });

  // A font name that is valid for the contract but not installed is refused.
  await p.evaluate(() => {
    const select = document.querySelector('select[name="config[fonts][body]"]');
    select.add(new Option('Comic Neue', 'Comic Neue', true, true));
  });
  await p.click('.blixis-setup-actions button[value="next"]');
  await p.waitForLoadState('load');
  check('a font that is not installed is refused with a field error', (await p.getAttribute('#blixis-fonts-body', 'aria-invalid')) === 'true', await p.locator('#blixis-setup-errors').innerText().catch(() => ''));
  await p.selectOption('select[name="config[fonts][body]"]', 'Liberation Sans', { force: true });
  await p.click('.blixis-setup-actions button[value="next"]');
  await p.waitForLoadState('load');
  check('an installed font is accepted', p.url().includes('step=layout') && (await p.locator('[aria-current="step"]').getAttribute('href')).includes('step=layout'), p.url());
  await p.goto(`${WIZARD}&step=typography`);
  check('the chosen font is kept in the draft', (await p.inputValue('#blixis-fonts-body')) === 'Liberation Sans');
  await admin.context.close();
}

async function readOnlyChecks(browser, label) {
  const narrow = await login(browser, 'fixture_admin', { width: 320, height: 800 });
  await narrow.page.goto(`${WIZARD}&step=typography`);
  await axe(narrow.page, `typography step at 320px (${label})`);
  const overflow = await narrow.page.evaluate(() => {
    const el = document.querySelector('.blixis-setup');
    return el.getBoundingClientRect().right <= document.documentElement.clientWidth + 1;
  });
  check('the wizard does not overflow at 320px (the font table scrolls inside its box)', overflow);
  await narrow.context.close();

  // Font loading on a public page.
  const context = await browser.newContext();
  const page = await context.newPage();
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(`${BASE}/?t0304_fonts=1`, { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    await document.fonts.ready;
    await document.fonts.load('16px "Liberation Sans"');
    const entries = performance.getEntriesByType('resource').filter((e) => /\.(ttf|otf|woff2?)(\?|$)/.test(e.name));
    const css = [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n');
    return {
      loaded: document.fonts.check('16px "Liberation Sans"'),
      family: getComputedStyle(document.querySelector('.t0304-sample')).fontFamily,
      entries: entries.map((e) => ({ name: e.name, bytes: e.encodedBodySize || e.transferSize, ms: Math.round(e.duration) })),
      swap: /font-display:\s*swap/.test(css),
    };
  });
  check('the chosen local font loads', result.loaded, JSON.stringify(result));
  check('@font-face rules use font-display swap', result.swap);
  check('font files load from this site only', result.entries.length > 0 && result.entries.every((e) => e.name.startsWith(BASE)), JSON.stringify(result.entries));
  const external = requests.filter((u) => !u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith(`blob:${BASE}`));
  check('no request leaves this site', external.length === 0, external.join(' '));
  check('only the face the page uses is downloaded', result.entries.length === 1, JSON.stringify(result.entries));
  note('font loading measurement', JSON.stringify(result.entries));
  await context.close();
}

const names = (process.env.T0304_BROWSERS || 'chromium').split(',').filter(Boolean);
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
