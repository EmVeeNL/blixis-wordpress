// Browser stage for task 02-03: Chromium (Playwright) against the throwaway site.
// Compares token-backed computed styles and element screenshots between the frontend and
// the block editor canvas. Prints PASS/FAIL/NOTE lines; writes screenshots to ./shots.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:8080';
const PAGE_ID = 4242;
const SWATCHES = ['primary', 'surface', 'foreground', 'muted', 'accent'];
let fails = 0;
const check = (name, ok, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} [browser] ${name}${!ok && detail ? ' -- ' + String(detail).slice(0, 300) : ''}`);
};
const note = (name, value) => console.log(`NOTE [browser] ${name}: ${String(value).slice(0, 300)}`);
mkdirSync('shots', { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', deviceScaleFactor: 1 });
const consoleErrors = [];
const page = await context.newPage();
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));

// What gets compared: token-backed computed styles, taken in whichever document holds the content.
const probe = (root) => {
  const pick = (el, props) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(props.map((p) => [p, cs.getPropertyValue(p)]));
  };
  const out = {};
  const h1 = root.querySelector('.wp-block-heading');
  const p = root.querySelector('p.has-muted-color');
  const btn = root.querySelector('.wp-block-button__link');
  out.heading = pick(h1, ['font-size', 'font-family', 'color']);
  out.paragraph = pick(p, ['font-size', 'color', 'font-family']);
  out.button = pick(btn, ['background-color', 'color']);
  for (const s of ['primary', 'surface', 'foreground', 'muted', 'accent']) {
    out['swatch-' + s] = pick(root.querySelector('.t0203-' + s), ['background-color', 'min-height', 'width']);
  }
  const rootStyle = getComputedStyle(root.ownerDocument.documentElement);
  for (const v of ['--wp--preset--color--primary', '--wp--preset--color--accent', '--wp--preset--font-family--body', '--wp--preset--font-size--3-xl', '--wp--preset--spacing--xl', '--wp--preset--shadow--md', '--wp--custom--blixis--layout--gutter']) {
    out['var ' + v] = rootStyle.getPropertyValue(v).trim();
  }
  return out;
};

// ---- Frontend.
const res = await page.goto(`${BASE}/?page_id=${PAGE_ID}`, { waitUntil: 'load' });
check('frontend page responds 200', res?.status() === 200, res?.status());
await page.waitForSelector('.t0203-primary');
const front = await page.evaluate(probe, await page.evaluateHandle(() => document.body));
await page.screenshot({ path: 'shots/frontend-full.png', fullPage: true });
const frontShots = {};
for (const s of SWATCHES) frontShots[s] = await page.locator('.t0203-' + s).first().screenshot({ path: `shots/frontend-swatch-${s}.png` });
check('frontend token primary is #155dfc (rgb 21,93,252)', front['swatch-primary']['background-color'] === 'rgb(21, 93, 252)', front['swatch-primary']['background-color']);
check('frontend body font is the configured stack', front['var --wp--preset--font-family--body'].includes('Local Sans'), front['var --wp--preset--font-family--body']);
check('frontend swatch width is the configured content width (42rem=672px)', front['swatch-primary'].width === '672px', front['swatch-primary'].width);

// ---- Editor.
await page.goto(`${BASE}/wp-login.php`);
await page.fill('#user_login', 'fixture_admin');
await page.fill('#user_pass', 'fixture-pass-0203');
await Promise.all([page.waitForURL(/wp-admin/), page.click('#wp-submit')]);
await page.goto(`${BASE}/wp-admin/post.php?post=${PAGE_ID}&action=edit`, { waitUntil: 'load' });
let frame = null;
try {
  await page.waitForSelector('iframe[name="editor-canvas"]', { timeout: 60000 });
  const handle = await page.$('iframe[name="editor-canvas"]');
  frame = await handle.contentFrame();
  await frame.waitForSelector('.t0203-primary', { timeout: 60000 });
} catch (e) {
  check('block editor canvas loads with the seeded content', false, e.message);
}
if (frame) {
  check('block editor canvas loads with the seeded content', true);
  const closeGuide = page.locator('button[aria-label="Close"]').first();
  if (await closeGuide.isVisible().catch(() => false)) await closeGuide.click().catch(() => {});
  const valid = await page.evaluate(() => window.wp.data.select('core/block-editor').getBlocks().every(function walk(b) { return b.isValid && b.innerBlocks.every(walk); }));
  check('every seeded block is valid in the editor (no recovery prompt)', valid);
  const body = await frame.evaluateHandle(() => document.body);
  const editor = await frame.evaluate(probe, body);
  await frame.locator('.t0203-primary').scrollIntoViewIfNeeded();
  await page.locator('iframe[name="editor-canvas"]').screenshot({ path: 'shots/editor-canvas.png' });
  await page.screenshot({ path: 'shots/editor-full.png' });

  // Computed-style parity. Layout widths may differ with editor chrome, so width is checked separately.
  let compared = 0;
  for (const key of Object.keys(front)) {
    if (key.endsWith('width') && key.startsWith('swatch')) continue;
    const a = JSON.stringify(front[key]);
    const b = JSON.stringify(editor[key]);
    const same = key.startsWith('swatch-') || key.startsWith('heading') || key.startsWith('paragraph') || key.startsWith('button')
      ? JSON.stringify({ ...front[key], width: undefined }) === JSON.stringify({ ...editor[key], width: undefined })
      : a === b;
    check(`editor == frontend computed: ${key}`, same, `${a} vs ${b}`);
    compared++;
  }
  note('computed groups compared', compared);
  check('editor swatch width equals configured content width', editor['swatch-primary'].width === '672px', editor['swatch-primary'].width);

  // Pixel comparison of the same elements in the two documents.
  const decode = async (buffers) => {
    const p = await context.newPage();
    const result = await p.evaluate(async (pairs) => {
      const load = (b64) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/png;base64,' + b64; });
      const out = [];
      for (const [a, b] of pairs) {
        const [ia, ib] = [await load(a), await load(b)];
        if (ia.width !== ib.width || ia.height !== ib.height) { out.push({ size: [ia.width, ia.height, ib.width, ib.height] }); continue; }
        const px = (img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, img.height).data; };
        const [da, db] = [px(ia), px(ib)];
        let diff = 0;
        // Ignore the outermost row on each side: the two documents place the block at different
        // fractional y offsets, so those rows blend with the neighbouring block.
        const w4 = ia.width * 4;
        for (let i = w4; i < da.length - w4; i += 4) if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2]) diff++;
        out.push({ diff, total: (da.length - 2 * w4) / 4 });
      }
      return out;
    }, buffers);
    await p.close();
    return result;
  };
  // Editor-only chrome (the empty-group inserter outline) is hidden for the pixel comparison; token
  // colours, sizes and radii are untouched.
  await frame.addStyleTag({ content: '.t0203-swatch .block-list-appender{display:none!important}.t0203-swatch{outline:none!important}' });
  const editorShots = {};
  for (const s of SWATCHES) editorShots[s] = await frame.locator('.t0203-' + s).first().screenshot({ path: `shots/editor-swatch-${s}.png` });
  const pairs = SWATCHES.map((s) => [frontShots[s].toString('base64'), editorShots[s].toString('base64')]);
  const results = await decode(pairs);
  SWATCHES.forEach((s, i) => check(`swatch screenshot ${s}: frontend == editor pixel-for-pixel`, results[i].diff === 0, JSON.stringify(results[i])));
  // Control: the comparison must detect a difference between two different tokens.
  const control = await decode([[frontShots.primary.toString('base64'), frontShots.accent.toString('base64')]]);
  check('control: primary vs accent screenshots differ', control[0].diff > 0, JSON.stringify(control[0]));
}
const relevant = consoleErrors.filter((e) => !/favicon|Failed to load resource.*(404|403)|Gutenberg.*deprecat/i.test(e));
note('console errors (filtered)', relevant.length ? relevant.join(' | ') : 'none');
note('console errors (all)', consoleErrors.length);
writeFileSync('shots/report.json', JSON.stringify({ front, consoleErrors }, null, 2));
await browser.close();
process.exit(fails === 0 ? 0 : 1);
