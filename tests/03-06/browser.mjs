// Task 03-06 browser stage: the wizard controls (colour formats, contrast, sliders, units,
// shadows, motion), live previews on every step, JavaScript on and off, keyboard use, reduced
// motion, and axe-core at 1280 and 320 px in English, Dutch, and Arabic.
// Prints PASS/FAIL/NOTE lines and ends with DONE-BROWSER.
import { chromium, firefox } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:8080';
const WIZARD = `${BASE}/wp-admin/themes.php?page=blixis-setup`;
const POST = `${BASE}/wp-admin/admin-post.php`;
const PASSWORD = process.env.T0306_ADMIN_PASSWORD;
const AXE = readFileSync('vendor/axe.min.js', 'utf8');
const ENGINES = { chromium, firefox };
const USERS = { en: 'fixture_admin', nl: 'fixture_nl', ar: 'fixture_ar' };

let fails = 0;
let current = '';
const check = (name, ok, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} [${current}] ${name}${!ok && detail ? ' -- ' + String(detail).slice(0, 600).replace(/\n/g, ' | ') : ''}`);
};
const note = (name, value) => console.log(`NOTE [${current}] ${name}: ${String(value).slice(0, 400)}`);
mkdirSync('shots', { recursive: true });

// A context for one user. With scriptOff the wizard script is blocked (axe still runs);
// with jsDisabled the browser runs no JavaScript at all.
async function login(browser, user, { viewport = { width: 1280, height: 900 }, scriptOff = false, jsDisabled = false, reducedMotion = 'no-preference' } = {}) {
  const context = await browser.newContext({ viewport, reducedMotion, javaScriptEnabled: !jsDisabled });
  if (scriptOff) await context.route('**/assets/setup.js*', (route) => route.abort());
  const page = await context.newPage();
  await page.goto(`${BASE}/wp-login.php?redirect_to=${encodeURIComponent(WIZARD)}`);
  await page.fill('#user_login', user);
  await page.fill('#user_pass', PASSWORD);
  await Promise.all([page.waitForURL((url) => url.pathname.startsWith('/wp-admin/'), { timeout: 60000, waitUntil: 'commit' }), page.click('#wp-submit')]);
  return { context, page };
}

const go = async (page, step) => {
  await page.goto(`${WIZARD}&step=${step}`, { waitUntil: 'load' });
};
const next = async (page) => {
  await Promise.all([page.waitForLoadState('load'), page.click('.blixis-setup-actions button[name="intent"][value="next"]')]);
  await page.waitForLoadState('load');
};
async function chooseTheme(page) {
  await go(page, 'theme');
  await page.check('input[name="choice"][value="acme-site"]');
  await next(page);
}
const hidden = (page, section, key) => page.inputValue(`input[name="config[${section}][${key}]"]`);
const field = (page, section, key) => page.locator(`.blixis-setup-field:has(input[name="config[${section}][${key}]"])`);
const settle = (page) => page.waitForTimeout(150);

async function axe(page, label) {
  await page.addScriptTag({ content: AXE });
  const result = await page.evaluate(async () => {
    const r = await window.axe.run({ include: ['.blixis-setup'] }, { resultTypes: ['violations'] });
    return r.violations.map((v) => `${v.id}(${v.nodes.length}) ${v.nodes[0]?.target}`);
  });
  check(`axe-core finds no violations: ${label}`, result.length === 0, result.join(' || '));
}

async function frameLoaded(page) {
  const handle = await page.$('.blixis-setup-frame iframe');
  if (handle === null) throw new Error(`no preview frame on ${page.url()}: ${(await page.title())}`);
  await handle.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const doc = document.querySelector('.blixis-setup-frame iframe')?.contentDocument;
    return doc && doc.readyState === 'complete' && doc.body && doc.body.children.length > 0;
  }, null, { timeout: 30000 });
  await settle(page);
  return handle;
}
const frameVar = (page, name) =>
  page.evaluate((n) => {
    const root = document.querySelector('.blixis-setup-frame iframe').contentDocument.documentElement;
    return { inline: root.style.getPropertyValue(n).trim(), scheme: root.style.colorScheme };
  }, name);

// ---------------------------------------------------------------------------
async function colorsFlow(browser) {
  const { context, page } = await login(browser, USERS.en);
  await chooseTheme(page);
  await go(page, 'colors');

  check('every colour has a picker, a format menu, and a contrast list', (await page.locator('.blixis-ctl-picker').count()) === 10 && (await page.locator('.blixis-ctl-format select').count()) === 10 && (await page.locator('.blixis-ctl-contrast').count()) === 10);
  check('the format switch is a native select with hex, RGB, HSL, OKLCH', JSON.stringify(await page.locator('.blixis-ctl-format select').first().locator('option').allTextContents()) === JSON.stringify(['Hex', 'RGB', 'HSL', 'OKLCH']));
  check('light and dark palettes sit side by side', await page.evaluate(() => {
    const a = document.querySelector('.blixis-setup-palette:nth-child(1)').getBoundingClientRect();
    const b = document.querySelector('.blixis-setup-palette:nth-child(2)').getBoundingClientRect();
    return Math.abs(a.top - b.top) < 5 && Math.abs(a.right - b.left) < a.width;
  }));

  const primary = page.locator('#blixis-colors-primary');
  const primaryField = field(page, 'colors', 'primary');
  await primary.fill('oklch(0.55 0.22 262)');
  check('the swatch works for OKLCH', await primaryField.locator('.blixis-setup-swatch').evaluate((el) => getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)' && !el.classList.contains('is-empty')));
  check('the picker follows an OKLCH value', /^#[0-9a-f]{6}$/.test(await primaryField.locator('.blixis-ctl-picker').inputValue()));
  check('the format menu detects OKLCH', (await primaryField.locator('.blixis-ctl-format select').inputValue()) === 'oklch');
  const formats = [['hex', /^#[0-9a-f]{6}$/], ['rgb', /^rgb\(\d+ \d+ \d+\)$/], ['hsl', /^hsl\([\d.]+ [\d.]+% [\d.]+%\)$/], ['oklch', /^oklch\([\d.]+ [\d.]+ [\d.]+\)$/]];
  for (const [format, pattern] of formats) {
    await primaryField.locator('.blixis-ctl-format select').selectOption(format);
    const text = await primary.inputValue();
    check(`switching to ${format} rewrites the value in that format`, pattern.test(text), text);
  }
  await primary.fill('#155dfc');
  await primaryField.locator('.blixis-ctl-picker').evaluate((el) => { el.value = '#aa0000'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  check('the picker writes the colour in the current format', (await primary.inputValue()) === '#aa0000');
  await primaryField.locator('.blixis-ctl-format select').selectOption('rgb');
  await primaryField.locator('.blixis-ctl-picker').evaluate((el) => { el.value = '#155dfc'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  check('the picker keeps the chosen format (RGB)', (await primary.inputValue()) === 'rgb(21 93 252)', await primary.inputValue());
  await primary.fill('#155dfc');

  const fg = field(page, 'colors', 'foreground');
  const lightWarnings = page.locator('.blixis-setup-palette:nth-child(1) .blixis-ctl-contrast .is-warn');
  check('the default light palette warns only for the cyan accent (interface parts, 3:1)', (await lightWarnings.count()) === 1 && /3:1/.test(await field(page, 'colors', 'accent').locator('.blixis-ctl-contrast .is-warn').innerText()));
  await page.fill('#blixis-colors-foreground', '#cccccc');
  await settle(page);
  const warn = fg.locator('.blixis-ctl-contrast .is-warn');
  check('a foreground below 4.5:1 shows a warning next to it', (await warn.count()) === 1 && /Warning/.test(await warn.innerText()) && /4\.5:1/.test(await warn.innerText()), await fg.locator('.blixis-ctl-contrast').innerText());
  check('the warning has an icon and text, not colour alone', /⚠/.test(await warn.innerText()));

  check('the dark specimen says no dark palette is set', /No dark palette/.test(await page.locator('.blixis-spec[data-scheme="dark"]').innerText()));
  await page.click('button[data-blixis-copy-light]');
  check('Start from the light colours fills the dark palette', (await page.inputValue('#blixis-colorsdark-primary')) === '#155dfc');
  const dark = { primary: '#7aa2ff', surface: '#0b1220', foreground: '#e6edf7', muted: '#9aa7bd', accent: '#22d3ee' };
  for (const [key, value] of Object.entries(dark)) await page.fill(`#blixis-colorsdark-${key}`, value);
  await settle(page);
  check('a good dark palette has no warnings', (await page.locator('.blixis-setup-palette:nth-child(2) .blixis-ctl-contrast .is-warn').count()) === 0);
  await page.fill('#blixis-colorsdark-foreground', '#222222');
  await settle(page);
  const darkWarn = page.locator('.blixis-setup-palette:nth-child(2) .blixis-ctl-contrast .is-warn');
  check('contrast warnings also appear for the dark palette', (await darkWarn.count()) >= 1 && /Warning/.test(await darkWarn.first().innerText()));
  await settle(page);
  check('the light specimen shows the light palette', (await page.locator('.blixis-spec[data-scheme="light"]').evaluate((el) => el.style.getPropertyValue('--blixis-color-foreground').trim())) === '#cccccc');
  check('the dark specimen shows the dark palette', (await page.locator('.blixis-spec[data-scheme="dark"]').evaluate((el) => el.style.getPropertyValue('--blixis-color-surface').trim())) === '#0b1220');
  await page.screenshot({ path: 'shots/c2-colors-light-dark.png', fullPage: true });
  await page.fill('#blixis-colorsdark-foreground', dark.foreground);
  await page.fill('#blixis-colors-foreground', '#101828');

  await frameLoaded(page);
  check('the front-page preview is on the colours step', (await page.locator('.blixis-setup-preview iframe').count()) === 1);
  await page.fill('#blixis-colors-primary', '#aa2200');
  await settle(page);
  check('the preview follows the form without a reload', (await frameVar(page, '--blixis-color-primary')).inline === '#aa2200');
  await page.fill('#blixis-colors-primary', '#155dfc');
  await page.check('.blixis-preview-scheme input[value="dark"]');
  await settle(page);
  const darkVar = await frameVar(page, '--blixis-color-surface');
  check('the dark preview shows the dark palette', darkVar.inline === '#0b1220' && darkVar.scheme === 'dark', JSON.stringify(darkVar));
  await page.check('.blixis-preview-scheme input[value="light"]');
  const live = page.locator('.blixis-setup-preview [aria-live="polite"]');
  check('the live region is polite and empty while typing', (await live.getAttribute('role')) === 'status' && (await live.innerText()) === '');
  await page.fill('#blixis-colors-muted', '#334155');
  await settle(page);
  check('typing does not announce the preview', (await live.innerText()) === '');
  await page.click('.blixis-setup-preview button:has-text("Describe the preview")');
  await page.waitForFunction(() => document.querySelector('.blixis-setup-preview [aria-live="polite"]').textContent.length > 20);
  check('the preview is announced only on request', /Preview in Light colours/.test(await live.innerText()), await live.innerText());
  await page.fill('#blixis-colors-muted', '#64748b');

  await page.check('#blixis-colors-scheme-dark');
  await next(page);
  check('the colours step submits with JavaScript', page.url().includes('step=typography'), page.url());
  await go(page, 'colors');
  check('the scheme setting was saved', await page.isChecked('#blixis-colors-scheme-dark'));
  check('the dark palette persisted in the draft', (await page.inputValue('#blixis-colorsdark-surface')) === '#0b1220');
  await page.check('#blixis-colors-scheme-system');
  await next(page);
  await go(page, 'colors');
  check('the scheme can go back to system', await page.isChecked('#blixis-colors-scheme-system'));

  for (const key of ['surface', 'foreground', 'muted', 'accent']) await page.fill(`#blixis-colorsdark-${key}`, '');
  await next(page);
  check('a partly filled dark palette is refused by the server', (await page.locator('#blixis-setup-errors').count()) === 1, page.url());
  for (const key of ['primary', 'surface', 'foreground', 'muted', 'accent']) await page.fill(`#blixis-colorsdark-${key}`, '');
  await next(page);
  await go(page, 'colors');
  check('an empty dark palette means no dark palette', (await page.inputValue('#blixis-colorsdark-primary')) === '');
  await page.evaluate(() => { document.querySelector('input[name="config[colors][accent]"]').value = 'not-a-colour'; });
  await next(page);
  check('the server refuses a colour the page let through', (await page.locator('#blixis-setup-errors').count()) === 1);
  await go(page, 'colors');
  check('a refused colour never reached the draft', (await page.inputValue('#blixis-colors-accent')) !== 'not-a-colour');
  await context.close();
}

// ---------------------------------------------------------------------------
async function typeScaleFlow(browser) {
  const { context, page } = await login(browser, USERS.en);
  await go(page, 'typography');
  // Start from the contract defaults: an earlier browser may have saved other sizes.
  for (const [key, value] of Object.entries({ xs: '0.75', sm: '0.875', base: '1', lg: '1.125', xl: '1.25', '2xl': '1.5', '3xl': '2' })) await page.fill(`#blixis-typescale-${key}`, value);
  const base = page.locator('#blixis-typescale-base');
  const baseField = field(page, 'typeScale', 'base');
  const slider = baseField.locator('input[type=range]');
  check('the base size has a visible label, a slider, a number field, and a unit menu', (await baseField.locator('label').first().isVisible()) && (await slider.isVisible()) && (await base.isVisible()) && (await baseField.locator('select').count()) === 1);
  check('the slider is named by the visible label', (await slider.evaluate((el) => document.getElementById(el.getAttribute('aria-labelledby')).tagName)) === 'LABEL');
  check('range and step come from the token map', (await slider.getAttribute('min')) === '0.75' && (await slider.getAttribute('max')) === '2' && (await slider.getAttribute('step')) === '0.0625');
  const num = async () => Number(await base.inputValue());
  await slider.focus();
  const v0 = await num();
  await page.keyboard.press('ArrowRight');
  const v1 = await num();
  check('Arrow keys move the slider by one step and the number follows', Math.abs(v1 - v0 - 0.0625) < 1e-9, `${v0} -> ${v1}`);
  await page.keyboard.press('ArrowLeft');
  check('Arrow keys move back', Math.abs((await num()) - v0) < 1e-9);
  await page.keyboard.press('PageUp');
  const v2 = await num();
  check('Page Up moves by more than one step', v2 - v0 > 0.0625 + 1e-9, `${v0} -> ${v2}`);
  await page.keyboard.press('PageDown');
  check('Page Down moves back', Math.abs((await num()) - v0) < 1e-9, String(await num()));
  await page.keyboard.press('Home');
  check('Home jumps to the minimum', (await num()) === 0.75);
  await page.keyboard.press('End');
  check('End jumps to the maximum', (await num()) === 2);
  check('the hidden form value follows the slider', (await hidden(page, 'typeScale', 'base')) === '2rem');
  await base.fill('1');
  check('the number field moves the slider', Number(await slider.inputValue()) === 1);

  const unit = baseField.locator('select');
  await unit.selectOption('px');
  check('changing the unit keeps the size (1rem is 16px)', (await base.inputValue()) === '16' && (await hidden(page, 'typeScale', 'base')) === '16px', await base.inputValue());
  check('the slider range follows the unit', (await slider.getAttribute('max')) === '32');
  await unit.selectOption('em');
  check('em keeps the size too', (await base.inputValue()) === '1' && (await hidden(page, 'typeScale', 'base')) === '1em');
  await unit.selectOption('rem');

  await page.check('.blixis-ctl-keep input[type=checkbox]');
  await base.fill('1.25');
  check('keep proportions scales the other sizes from the base size', (await hidden(page, 'typeScale', 'xs')) === '0.9375rem' && (await hidden(page, 'typeScale', '3xl')) === '2.5rem', `${await hidden(page, 'typeScale', 'xs')} ${await hidden(page, 'typeScale', '3xl')}`);
  check('the other sliders show the scaled sizes', (await page.inputValue('#blixis-typescale-3xl')) === '2.5');
  await page.uncheck('.blixis-ctl-keep input[type=checkbox]');
  await base.fill('1.5');
  check('without keep proportions only the base moves', (await hidden(page, 'typeScale', 'xs')) === '0.9375rem');

  await base.fill('1.25');
  await settle(page);
  const sized = await page.evaluate(() => {
    const spec = document.querySelector('.blixis-spec-type[data-size="base"]');
    const probe = document.createElement('div');
    probe.style.fontSize = '1.25rem';
    document.body.append(probe);
    const expected = getComputedStyle(probe).fontSize;
    probe.remove();
    return [getComputedStyle(spec).fontSize, expected];
  });
  check('the type specimen follows the base size', sized[0] === sized[1], sized.join(' vs '));
  await frameLoaded(page);
  check('the front-page preview on the typography step follows the size', (await frameVar(page, '--blixis-text-base')).inline === '1.25rem');
  await page.screenshot({ path: 'shots/c2-typescale.png', fullPage: true });
  await next(page);
  check('the typography step submits', page.url().includes('step=layout'), page.url());
  await context.close();
}

// ---------------------------------------------------------------------------
async function layoutFlow(browser) {
  const { context, page } = await login(browser, USERS.en);
  await go(page, 'layout');
  const md = field(page, 'spacing', 'md');
  await md.locator('input[type=range]').focus();
  await page.keyboard.press('Home');
  check('spacing keyboard: Home reaches the minimum from the token map', (await hidden(page, 'spacing', 'md')) === '0.5rem');
  await page.fill('#blixis-spacing-md', '1');
  check('radius and layout widths have sliders and unit menus', (await page.locator('.blixis-setup-radius input[type=range]').count()) === 3 && (await page.locator('.blixis-setup-layout select').count()) === 3);
  const widthUnits = await field(page, 'layout', 'contentWidth').locator('select option').allTextContents();
  check('layout widths offer px, rem, %, ch, and vw', JSON.stringify(widthUnits) === JSON.stringify(['px', 'rem', '%', 'ch', 'vw']), widthUnits.join());
  const spacingUnits = await md.locator('select option').allTextContents();
  check('spacing offers px, rem, and em', JSON.stringify(spacingUnits) === JSON.stringify(['px', 'rem', 'em']));
  check('spacing ruler, radius samples, width bars, and shadow cards are shown', (await page.locator('.blixis-spec-ruler').count()) === 1 && (await page.locator('.blixis-spec-box').count()) === 6 && (await page.locator('.blixis-spec-widths').count()) === 1);

  const sm = field(page, 'shadows', 'sm');
  const presetNames = await sm.locator('.blixis-card-name').allTextContents();
  check('shadow presets are None, Subtle, Soft, Medium, Strong', JSON.stringify(presetNames) === JSON.stringify(['None', 'Subtle', 'Soft', 'Medium', 'Strong']), presetNames.join());
  check('the presets are a radio group', (await sm.locator('[role=radiogroup] input[type=radio]').count()) === 5);
  await sm.locator('label.blixis-card', { hasText: 'Strong' }).click();
  check('choosing a preset card sets the shadow', (await hidden(page, 'shadows', 'sm')) === '0 20px 25px -5px #00000026, 0 8px 10px -6px #00000026');
  await sm.locator('summary', { hasText: 'Adjust' }).click();
  await sm.locator('.blixis-ctl-row', { hasText: 'Blur' }).locator('input[type=number]').fill('30');
  check('the Adjust panel edits the first layer', /^0 20px 30px -5px #00000026, 0 8px 10px -6px/.test(await hidden(page, 'shadows', 'sm')), await hidden(page, 'shadows', 'sm'));
  check('an adjusted shadow no longer matches a preset card', (await sm.locator('[role=radiogroup] input:checked').count()) === 0);
  await sm.locator('.blixis-ctl-row', { hasText: 'Opacity' }).locator('input[type=number]').fill('50');
  check('opacity writes the alpha into the colour', /#00000080/.test(await hidden(page, 'shadows', 'sm')), await hidden(page, 'shadows', 'sm'));
  await sm.locator('input[type=color]').evaluate((el) => { el.value = '#112233'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  check('the colour choice changes the shadow colour', /#11223380/.test(await hidden(page, 'shadows', 'sm')), await hidden(page, 'shadows', 'sm'));
  await sm.locator('label.blixis-card', { hasText: 'None' }).click();
  check('None sets the shadow to none', (await hidden(page, 'shadows', 'sm')) === 'none');
  await sm.locator('label.blixis-card', { hasText: 'Subtle' }).click();
  await sm.locator('summary', { hasText: 'Edit as CSS' }).click();
  const css = sm.locator('input[name="config[shadows][sm]"]');
  check('the raw CSS stays available behind Edit as CSS', (await css.isVisible()) && (await css.inputValue()) === '0 1px 2px 0 #0000001a');
  await css.fill('0 2px 4px 0 #00000033');
  check('typed CSS clears the preset and updates the panel', (await sm.locator('[role=radiogroup] input:checked').count()) === 0 && (await sm.locator('.blixis-ctl-row', { hasText: 'Vertical offset' }).locator('input[type=number]').inputValue()) === '2');
  await css.fill('wide shadow');
  await settle(page);
  check('a value the server would refuse is flagged', await css.evaluate((el) => el.hasAttribute('data-invalid')));
  await css.fill('0 1px 2px 0 #0000001a');
  await sm.locator('summary', { hasText: 'Adjust' }).click();

  const fast = page.locator('#blixis-motion-durationfast');
  await fast.fill('200');
  check('motion speeds are millisecond sliders from the token map', (await hidden(page, 'motion', 'durationFast')) === '200ms' && (await field(page, 'motion', 'durationFast').locator('input[type=range]').getAttribute('max')) === '500');
  const speedLabels = await page.locator('.blixis-setup-motion > .blixis-setup-field > label').allTextContents();
  check('the speeds are named Fast, Normal, Slow', JSON.stringify(speedLabels) === JSON.stringify(['Fast', 'Normal', 'Slow', 'Easing']), speedLabels.join());
  const easing = field(page, 'motion', 'easing');
  const easingNames = await easing.locator('.blixis-card-name').allTextContents();
  check('easing presets have plain names', JSON.stringify(easingNames) === JSON.stringify(['Smooth', 'Gentle start', 'Gentle stop', 'Linear', 'Springy']), easingNames.join());
  await easing.locator('label.blixis-card', { hasText: 'Springy' }).click();
  check('choosing an easing card sets the easing', (await hidden(page, 'motion', 'easing')) === 'cubic-bezier(0.34, 1.56, 0.64, 1)');
  check('the motion sample does not play by itself', (await page.evaluate(() => [...document.querySelectorAll('.blixis-motion-dot')].reduce((n, el) => n + el.getAnimations().length, 0))) === 0);
  await page.click('.blixis-spec-motion button:has-text("Play")');
  check('Play animates the sample', (await page.evaluate(() => [...document.querySelectorAll('.blixis-motion-dot')].reduce((n, el) => n + el.getAnimations().length, 0))) === 3);
  await page.screenshot({ path: 'shots/c2-motion.png', fullPage: true });
  await easing.locator('label.blixis-card', { hasText: 'Smooth' }).click();
  await fast.fill('120');

  const button = page.locator('.blixis-setup-actions button[name="intent"][value="next"]');
  {
    const start = (await button.innerText()).trim();
    await page.fill('#blixis-spacing-md', '0.75');
    check('the button says Save and continue once a field changes', (await button.innerText()).trim() === (await button.getAttribute('data-label-save')));
    await page.fill('#blixis-spacing-md', '1');
    check('and returns to its first label when the value is restored', (await button.innerText()).trim() === start, `${start} / ${await button.innerText()}`);
  }

  await sm.locator('summary', { hasText: 'Adjust' }).click();
  await sm.locator('label.blixis-card', { hasText: 'Medium' }).click();
  await frameLoaded(page);
  await sm.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'shots/c2-shadows-adjust.png', fullPage: true });
  await next(page);
  check('the layout step submits', page.url().includes('step=review'), page.url());
  await context.close();
}


// The server renders the three labels (data-label-*); the script switches between them.
async function labelFlow(browser) {
  const { context, page } = await login(browser, USERS.en);
  await go(page, 'layout');
  const button = page.locator('.blixis-setup-actions button[name="intent"][value="next"]');
  check('the submit button carries its three labels', (await button.getAttribute('data-label-save')) !== null, await button.innerText());
  const start = (await button.innerText()).trim();
  const original = await page.inputValue('#blixis-spacing-md');
  await page.fill('#blixis-spacing-md', String(Number(original) + 0.25));
  check('the button says Save and continue once a field changes', (await button.innerText()).trim() === 'Save and continue', await button.innerText());
  await page.fill('#blixis-spacing-md', original);
  check('and returns to its first label when the value is restored', (await button.innerText()).trim() === start, `${start} / ${await button.innerText()}`);
  await go(page, 'theme');
  await page.check('input[name="choice"][value="__new"]').catch(() => {});
  check('with a new theme selected the button says Create theme and continue', (await button.innerText()).trim() === (await button.getAttribute('data-label-create')), await button.innerText());
  await context.close();
}

async function reducedMotionFlow(browser) {
  const { context, page } = await login(browser, USERS.en, { reducedMotion: 'reduce' });
  await go(page, 'layout');
  check('under reduced motion the Play button is hidden', !(await page.locator('.blixis-spec-motion button').isVisible()));
  const still = page.locator('.blixis-motion-still');
  check('under reduced motion a static explanation is shown', (await still.isVisible()) && /reduced motion/.test(await still.innerText()) && /120ms/.test(await still.innerText()), await still.innerText());
  check('nothing animates under reduced motion', (await page.evaluate(() => [...document.querySelectorAll('.blixis-motion-dot')].reduce((n, el) => n + el.getAnimations().length, 0))) === 0);
  await context.close();
}

async function noJavaScriptFlow(browser) {
  const { context, page } = await login(browser, USERS.en, { jsDisabled: true });
  await go(page, 'colors');
  check('without JavaScript the colour fields are plain inputs', (await page.locator('.blixis-ctl-picker').count()) === 0 && (await page.locator('#blixis-colors-primary[type="text"]').count()) === 1);
  check('without JavaScript the scheme setting is a plain radio group', (await page.locator('input[name="scheme"]').count()) === 3);
  await page.screenshot({ path: 'shots/c2-colors-js-off.png', fullPage: true });
  await page.fill('#blixis-colors-primary', '#112233');
  await page.check('#blixis-colors-scheme-light');
  await next(page);
  check('without JavaScript a step submits and the server validates', page.url().includes('step=typography'), page.url());
  await go(page, 'colors');
  check('without JavaScript the value was saved', (await page.inputValue('#blixis-colors-primary')) === '#112233' && (await page.isChecked('#blixis-colors-scheme-light')));
  await page.fill('#blixis-colors-primary', 'nonsense');
  await next(page);
  check('without JavaScript an invalid colour is refused with an error', (await page.locator('#blixis-setup-errors').count()) === 1 && (await page.locator('.blixis-setup-error').count()) >= 1);
  await go(page, 'layout');
  check('without JavaScript shadows are plain text fields', (await page.locator('input[name="config[shadows][sm]"][type="text"]').isVisible()) && (await page.locator('.blixis-card').count()) === 0);
  check('the front-page preview is on the layout step without JavaScript', (await page.locator('.blixis-setup-preview iframe').count()) === 1);
  await go(page, 'colors');
  await page.fill('#blixis-colors-primary', '#155dfc');
  await page.check('#blixis-colors-scheme-system');
  await next(page);
  await context.close();
}

async function permissionChecks(browser) {
  const editor = await login(browser, 'fixture_editor');
  const noAccess = await editor.page.request.post(POST, { form: { action: 'blixis_setup', step: 'colors', scheme: 'dark' }, maxRedirects: 0 });
  check('an editor cannot change the colour scheme through the handler', noAccess.status() === 403, String(noAccess.status()));
  await editor.context.close();
  const { context, page } = await login(browser, USERS.en);
  const forged = await page.request.post(POST, { form: { action: 'blixis_setup', step: 'colors', scheme: 'dark', _wpnonce: 'deadbeef00' }, maxRedirects: 0 });
  check('a forged nonce cannot change the colour scheme', forged.status() === 403, String(forged.status()));
  await go(page, 'colors');
  check('the colour scheme is unchanged after refused requests', await page.isChecked('#blixis-colors-scheme-system'));
  const nonce = await page.inputValue('.blixis-setup-form input[name="_wpnonce"]');
  const bad = await page.request.post(POST, { form: { action: 'blixis_setup', step: 'colors', scheme: 'sepia', _wpnonce: nonce, 'config[colors][primary]': '#155dfc', 'config[colors][surface]': '#ffffff', 'config[colors][foreground]': '#101828', 'config[colors][muted]': '#64748b', 'config[colors][accent]': '#06b6d4' }, maxRedirects: 0 });
  await go(page, 'colors');
  check('an unknown scheme value is refused, not stored', bad.status() === 302 && (await page.locator('#blixis-setup-errors').count()) === 1 && (await page.isChecked('#blixis-colors-scheme-system')), String(bad.status()));
  await context.close();
}

async function darkReview(browser) {
  const { context, page } = await login(browser, USERS.en);
  await go(page, 'colors');
  await page.click('button[data-blixis-copy-light]');
  const dark = { primary: '#7aa2ff', surface: '#0b1220', foreground: '#e6edf7', muted: '#9aa7bd', accent: '#22d3ee' };
  for (const [key, value] of Object.entries(dark)) await page.fill(`#blixis-colorsdark-${key}`, value);
  await next(page);
  await go(page, 'review');
  await frameLoaded(page);
  await page.check('.blixis-preview-scheme input[value="dark"]');
  await settle(page);
  const seen = await frameVar(page, '--blixis-color-surface');
  check('the review preview switches to the dark palette', seen.inline === '#0b1220' && seen.scheme === 'dark', JSON.stringify(seen));
  await page.locator('.blixis-setup-preview').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'shots/c2-review-dark-preview.png', fullPage: true });
  await go(page, 'colors');
  for (const key of Object.keys(dark)) await page.fill(`#blixis-colorsdark-${key}`, '');
  await next(page);
  await context.close();
}


// Full-page captures without the fixed admin bar and menu: made static they still take up space,
// so they are taken out of the capture instead.
async function shot(page, path) {
  await page.addStyleTag({ content: '#wpadminbar, #adminmenumain { display: none !important; } #wpcontent, #wpfooter { margin-inline-start: 0 !important; } html.wp-toolbar { padding-top: 0 !important; }' });
  await page.screenshot({ path, fullPage: true });
}
async function mergedShots(browser) {
  let s = await login(browser, USERS.en, { viewport: { width: 1280, height: 900 } });
  await go(s.page, 'colors');
  await s.page.fill('#blixis-colors-foreground', '#cccccc');
  await settle(s.page);
  await frameLoaded(s.page);
  await shot(s.page, 'shots/c3-colors-1280.png');
  await s.page.fill('#blixis-colors-foreground', '#101828');
  await go(s.page, 'theme');
  await s.page.check('input[name="choice"][value="__new"]');
  await settle(s.page);
  await shot(s.page, 'shots/c3-theme-new-1280.png');
  await s.context.close();
  s = await login(browser, USERS.en, { viewport: { width: 320, height: 800 } });
  await go(s.page, 'colors');
  await frameLoaded(s.page);
  await shot(s.page, 'shots/c3-colors-320.png');
  await s.context.close();
  s = await login(browser, USERS.ar, { viewport: { width: 1280, height: 900 } });
  await chooseTheme(s.page);
  await go(s.page, 'colors');
  await frameLoaded(s.page);
  await shot(s.page, 'shots/c3-colors-arabic.png');
  await go(s.page, 'theme');
  await s.page.check('input[name="choice"][value="__new"]');
  await settle(s.page);
  await shot(s.page, 'shots/c3-theme-new-arabic.png');
  await s.context.close();
}

async function a11yMatrix(browser, engine) {
  for (const [locale, user] of Object.entries(USERS)) {
    const setup = await login(browser, user);
    await chooseTheme(setup.page);
    await setup.context.close();
    for (const scriptOff of [false, true]) {
      for (const width of [1280, 320]) {
        const { context, page } = await login(browser, user, { viewport: { width, height: 900 }, scriptOff });
        const mode = scriptOff ? 'JavaScript off' : 'JavaScript on';
        for (const step of ['colors', 'typography', 'layout', 'review']) {
          await go(page, step);
          if (locale === 'ar' && step === 'colors') {
            const dir = await page.evaluate(() => document.documentElement.dir);
            check(`Arabic admin is right to left (${mode}, ${width}px)`, dir === 'rtl', dir);
          }
          await axe(page, `${step} step, ${width}px, ${locale}, ${mode}`);
          if (width === 320) {
            const fits = await page.evaluate(() => {
              const r = document.querySelector('.blixis-setup').getBoundingClientRect();
              return r.right <= document.documentElement.clientWidth + 1 && r.left >= -1;
            });
            check(`the ${step} step fits at 320px (${locale}, ${mode})`, fits);
          }
          if (engine === 'chromium' && !scriptOff) {
            if (width === 320 && locale === 'en' && step === 'colors') await page.screenshot({ path: 'shots/c2-colors-320.png', fullPage: true });
            if (width === 1280 && locale === 'ar' && step === 'colors') await page.screenshot({ path: 'shots/c2-colors-arabic.png', fullPage: true });
          }
        }
        await context.close();
      }
    }
  }
}

const names = (process.env.T0306_BROWSERS || 'chromium').split(',').filter(Boolean);
for (const name of names) {
  current = name;
  let browser;
  try {
    browser = await ENGINES[name].launch();
  } catch (error) {
    console.log(`HARNESS browser ${name} did not start: ${error.message}`);
    continue;
  }
  try {
    await colorsFlow(browser);
    await typeScaleFlow(browser);
    await layoutFlow(browser);
    await labelFlow(browser);
    await reducedMotionFlow(browser);
    await noJavaScriptFlow(browser);
    await permissionChecks(browser);
    await darkReview(browser);
    if (name === 'chromium') await mergedShots(browser);
    await a11yMatrix(browser, name);
  } catch (error) {
    check('browser flow completed without an exception', false, error.stack || error.message);
  }
  await browser.close();
}
note('result', `${fails} failed`);
console.log(`DONE-BROWSER ${names.join(',')}`);
process.exit(fails ? 1 : 0);
