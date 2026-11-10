// Task 03-07 Part D browser stage: step 1 of the setup wizard for a new child theme. Layout cards and
// style preset cards, creating a theme per layout, the preset filling the token draft, the layout
// in the layout draft, the path without JavaScript, refusals, and axe-core at 1280 and 320 px in
// English, Dutch, and Arabic. Prints PASS/FAIL lines and ends with DONE-BROWSER.
import { chromium, firefox } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';

const BASE = 'http://127.0.0.1:8080';
const WIZARD = `${BASE}/wp-admin/themes.php?page=blixis-setup`;
const POST = `${BASE}/wp-admin/admin-post.php`;
const PASSWORD = process.env.T0307_ADMIN_PASSWORD;
const out = process.env.T0307_OUT || '/work/shots';
const browsersToRun = (process.env.T0307_BROWSERS || 'chromium').split(',');
const AXE = await readFile('/work/vendor/axe.min.js', 'utf8');
await mkdir(out, { recursive: true });
const USERS = { en: 'fixture_admin', nl: 'fixture_nl', ar: 'fixture_ar' };
const LAYOUTS = ['blank', 'business', 'portfolio', 'blog', 'landing'];
// Primary colour of each preset, from plugins/blixis-blocks/inc/setup/presets/*.json.
const PRESETS = { neutral: '#155dfc', warm: '#8a3412', fresh: '#166534', bold: '#1e3a8a', minimal: '#374151', night: '#93c5fd' };

let fails = 0;
let current = '';
const check = (ok, label, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} [wizard ${current}] ${label}${!ok && detail ? ` -- ${String(detail).slice(0, 500).replace(/\n/g, ' | ')}` : ''}`);
};
const ENGINES = { chromium, firefox };

async function login(browser, user, { viewport = { width: 1280, height: 1000 }, jsDisabled = false } = {}) {
  const context = await browser.newContext({ viewport, javaScriptEnabled: !jsDisabled });
  const page = await context.newPage();
  for (let attempt = 1; ; attempt++) {
    await page.goto(`${BASE}/wp-login.php?redirect_to=${encodeURIComponent(WIZARD)}`, { waitUntil: 'load' });
    await page.fill('#user_login', user);
    await page.fill('#user_pass', PASSWORD);
    try {
      await Promise.all([page.waitForURL((url) => url.pathname.startsWith('/wp-admin/'), { timeout: 30000, waitUntil: 'commit' }), page.click('#wp-submit')]);
      break;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
  return { context, page };
}
const go = (page, step) => page.goto(`${WIZARD}&step=${step}`, { waitUntil: 'load', timeout: 60000 });
const submit = async (page) => {
  await Promise.all([page.waitForLoadState('load'), page.click('.blixis-setup-actions button[name="intent"][value="next"]')]);
  await page.waitForLoadState('load');
};
async function axe(page, label) {
  await page.addScriptTag({ content: AXE });
  const result = await page.evaluate(async () => (await window.axe.run({ include: ['.blixis-setup'] }, { resultTypes: ['violations'] })).violations.map((v) => `${v.id}(${v.nodes.length}) ${v.nodes[0]?.target}`));
  check(result.length === 0, `axe-core finds no violations: ${label}`, result.join(' || '));
}
const draftData = (page) => page.locator('#blixis-setup-data').evaluate((el) => JSON.parse(el.textContent));
const card = (page, group, key) => page.locator(`label.blixis-opt-card[for="blixis-new-${group}-${key}"]`);

async function fillNewTheme(page, { name, slug, layout, preset }) {
  await go(page, 'theme');
  await page.check('#blixis-theme-choice-new');
  await page.fill('#blixis-theme-name', name);
  await page.fill('#blixis-theme-slug', slug);
  if (layout) await card(page, 'layout', layout).click();
  if (preset) await card(page, 'preset', preset).click();
}

async function cardsFlow(browser, engine) {
  const { context, page } = await login(browser, USERS.en);
  await go(page, 'theme');
  await page.check('#blixis-theme-choice-new');
  check((await page.locator('input[name="new_layout"][type="radio"]').count()) === 5 && (await page.locator('input[name="new_preset"][type="radio"]').count()) === 6, 'five layout cards and six style cards, all native radios');
  check((await page.locator('select[name="new_starter"]').count()) === 0, 'the old Starting content select is gone');
  check(JSON.stringify(await page.locator('input[name="new_layout"]').evaluateAll((els) => els.map((el) => el.value))) === JSON.stringify(LAYOUTS), 'the layout cards are Blank, Business, Portfolio, Blog, Landing page in order');
  check((await page.getByRole('radio', { name: /^Landing page/ }).count()) === 1 && (await page.getByRole('group', { name: 'Layout' }).count()) === 1 && (await page.getByRole('group', { name: 'Style' }).count()) === 1, 'the groups are named Layout and Style and each card has an accessible name');
  const thumbs = await page.locator('.blixis-opt-card__thumb').evaluateAll((els) => els.map((el) => [el.getAttribute('src'), el.complete && el.naturalWidth > 0]));
  check(thumbs.length === 5 && thumbs.every(([src, ok]) => /assets\/layouts\/[a-z]+\.svg/.test(src) && ok), 'the layout thumbnails are the bundled SVGs and they load', JSON.stringify(thumbs));
  check((await page.locator('#blixis-new-layout-blank').isChecked()) && (await page.locator('#blixis-new-preset-neutral').isChecked()), 'Blank and Neutral are chosen by default');
  const states = await page.evaluate(() => { const on = document.querySelector('label[for="blixis-new-layout-blank"]'); const off = document.querySelector('label[for="blixis-new-layout-blog"]'); return [getComputedStyle(on).borderColor, getComputedStyle(off).borderColor]; });
  check(states[0] !== states[1], 'the chosen card has its own border colour', JSON.stringify(states));
  // Keyboard: Tab reaches the checked card, the arrow keys move the choice, focus is visible.
  await page.locator('#blixis-new-layout-blank').focus();
  await page.keyboard.press('ArrowRight');
  const focusRing = await page.evaluate(() => { const label = document.activeElement.closest('label'); return [document.activeElement.id, getComputedStyle(label).outlineStyle, getComputedStyle(label).outlineWidth]; });
  check(focusRing[0] === 'blixis-new-layout-business' && focusRing[1] === 'solid' && parseFloat(focusRing[2]) >= 2, 'the arrow keys choose the next layout and its card shows a focus outline', JSON.stringify(focusRing));
  check(await page.locator('#blixis-new-layout-business').isChecked(), 'the focused layout is the chosen one');
  await card(page, 'layout', 'blank').click();
  if (engine === 'chromium') {
    await page.locator('.blixis-setup-new-theme').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/f-step1-new-theme-1280.png`, fullPage: true });
  }
  await context.close();
}

async function createPerLayout(browser, engine) {
  const presets = Object.keys(PRESETS);
  for (const [index, layout] of LAYOUTS.entries()) {
    const preset = presets[index];
    const { context, page } = await login(browser, USERS.en);
    const slug = `wiz-${engine}-${layout}`;
    await fillNewTheme(page, { name: `Wizard ${layout}`, slug, layout, preset });
    await submit(page);
    check(page.url().includes('step=colors'), `creating a ${layout} theme with the ${preset} style moves on to the colours step`, `${page.url()} ${await page.locator('#blixis-setup-errors').innerText().catch(() => '')}`);
    check((await page.inputValue('#blixis-colors-primary')) === PRESETS[preset], `the ${preset} style filled the token draft (primary ${PRESETS[preset]})`, await page.inputValue('#blixis-colors-primary'));
    await go(page, 'header');
    const data = await draftData(page);
    check(data.layout.layout === layout && data.layout.theme.slug === slug, `the layout draft holds ${layout} for ${slug}`, JSON.stringify(data.layout?.layout));
    check(data.config.theme.slug === slug && data.config.theme.parent === 'blixis-base', 'the token draft belongs to the new theme', JSON.stringify(data.config.theme));
    await go(page, 'review');
    const review = await page.locator('.blixis-setup-form').innerText();
    check(review.includes(`Layout: ${layout === 'landing' ? 'Landing page' : layout[0].toUpperCase() + layout.slice(1)}`) && review.includes(slug), `the review lists the ${layout} layout and the theme`, review.slice(0, 300));
    if (layout === 'night' || preset === 'night') {
      await go(page, 'colors');
      check((await page.inputValue('#blixis-colorsdark-primary')) === '#93c5fd', 'a style with a dark palette fills the dark colours');
    }
    await context.close();
  }
}

async function presetFlow(browser, engine) {
  const { context, page } = await login(browser, USERS.en);
  await fillNewTheme(page, { name: 'Wizard night', slug: `wiz-${engine}-night`, layout: 'business', preset: 'night' });
  await submit(page);
  await go(page, 'colors');
  check((await page.inputValue('#blixis-colorsdark-primary')) === '#93c5fd' && (await page.inputValue('#blixis-colors-surface')) === '#111827', 'the Night style fills its dark palette and surface');
  await context.close();
}

async function noJavaScript(browser, engine) {
  const { context, page } = await login(browser, USERS.en, { jsDisabled: true });
  await fillNewTheme(page, { name: 'Wizard plain', slug: `wiz-${engine}-nojs`, layout: 'portfolio', preset: 'warm' });
  check(await page.locator('#blixis-new-layout-portfolio').isChecked()&& (await page.locator('button[value="next"] [data-label-value="create"]').isVisible()), 'without JavaScript the cards are plain radios and the form is usable');
  await submit(page);
  check(page.url().includes('step=colors') && (await page.inputValue('#blixis-colors-primary')) === PRESETS.warm, 'without JavaScript the server creates the theme and applies the style', page.url());
  await context.close();
}

async function refusals(browser, engine) {
  const { context, page } = await login(browser, USERS.en);
  await go(page, 'theme');
  const nonce = await page.inputValue('.blixis-setup-form input[name="_wpnonce"]');
  const base = { action: 'blixis_setup', step: 'theme', choice: '__new', _wpnonce: nonce };
  const badLayout = await page.request.post(POST, { form: { ...base, new_name: 'Bad layout', new_slug: `bad-${engine}-layout`, new_layout: 'gallery', new_preset: 'neutral' }, maxRedirects: 0 });
  await go(page, 'theme');
  check(badLayout.status() === 302 && (await page.locator('#blixis-setup-errors').innerText()).includes('Layout'), 'an unknown layout is refused with a field error', String(badLayout.status()));
  check((await page.locator('#blixis-theme-layout #blixis-theme-layout-error').count()) === 1, 'the layout error sits in the layout group');
  const nonce2 = await page.inputValue('.blixis-setup-form input[name="_wpnonce"]');
  const badPreset = await page.request.post(POST, { form: { ...base, _wpnonce: nonce2, new_name: 'Bad preset', new_slug: `bad-${engine}-preset`, new_layout: 'blank', new_preset: 'chaos' }, maxRedirects: 0 });
  await go(page, 'theme');
  check(badPreset.status() === 302 && (await page.locator('#blixis-setup-errors').innerText()).includes('Style'), 'an unknown style is refused and no theme is created', String(badPreset.status()));
  check((await page.locator('#blixis-theme-preset #blixis-theme-preset-error').count()) === 1, 'the style error sits in the style group');
  const listed = await page.locator('input[name="choice"]').evaluateAll((els) => els.map((el) => el.value));
  check(!listed.includes(`bad-${engine}-layout`) && !listed.includes(`bad-${engine}-preset`), 'no theme was created by the refused requests', listed.join());
  const forged = await page.request.post(POST, { form: { ...base, _wpnonce: 'deadbeef00', new_name: 'Forged', new_slug: `forged-${engine}`, new_layout: 'blank', new_preset: 'neutral' }, maxRedirects: 0 });
  check(forged.status() === 403, 'a forged nonce cannot create a theme', String(forged.status()));
  await context.close();
  const editor = await login(browser, 'fixture_editor');
  const denied = await editor.page.request.post(POST, { form: { action: 'blixis_setup', step: 'theme', choice: '__new', new_name: 'Nope', new_slug: `nope-${engine}`, new_layout: 'blank', new_preset: 'neutral' }, maxRedirects: 0 });
  check(denied.status() === 403, 'an editor cannot create a theme through the handler', String(denied.status()));
  await editor.context.close();
}

async function a11y(browser, engine) {
  for (const [locale, user] of Object.entries(USERS)) {
    for (const width of [1280, 320]) {
      const { context, page } = await login(browser, user, { viewport: { width, height: 1000 } });
      await go(page, 'theme');
      await page.check('#blixis-theme-choice-new');
      await card(page, 'layout', 'landing').click();
      await card(page, 'preset', 'night').click();
      await axe(page, `step 1 with the new-theme cards, ${width}px, ${locale}`);
      if (width === 320) {
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        check(overflow <= 1, `no horizontal overflow on step 1 at 320px (${locale})`, String(overflow));
      }
      if (engine === 'chromium' && locale === 'en' && width === 320) await page.screenshot({ path: `${out}/f-step1-new-theme-320.png`, fullPage: true });
      if (engine === 'chromium' && locale === 'ar' && width === 1280) {
        check((await page.evaluate(() => document.documentElement.dir)) === 'rtl', 'step 1 is right to left in Arabic');
        const ltr = await page.evaluate(() => { const grid = document.querySelector('.blixis-opt-cards'); const first = grid.firstElementChild.getBoundingClientRect(); const last = grid.lastElementChild.getBoundingClientRect(); return first.left >= last.left; });
        check(ltr, 'the cards flow from the right in Arabic');
        await page.screenshot({ path: `${out}/f-step1-arabic.png`, fullPage: true });
      }
      await context.close();
    }
  }
}

for (const name of browsersToRun) {
  current = name;
  const browser = await ENGINES[name].launch();
  try {
    await cardsFlow(browser, name);
    await createPerLayout(browser, name);
    await presetFlow(browser, name);
    await noJavaScript(browser, name);
    await refusals(browser, name);
    await a11y(browser, name);
  } catch (error) {
    check(false, 'wizard flow completed without an exception', error.stack || error.message);
  }
  await browser.close();
}
console.log(`DONE-BROWSER ${fails}`);
process.exit(fails ? 1 : 0);
