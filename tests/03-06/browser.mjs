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
  // Wait for the full load before submitting, and retry once (a slow Firefox once submitted
  // before wp-login.php had finished loading, so the login silently failed).
  for (let attempt = 1; ; attempt++) {
    await page.goto(`${BASE}/wp-login.php?redirect_to=${encodeURIComponent(WIZARD)}`, { waitUntil: 'load' });
    await page.fill('#user_login', user);
    await page.fill('#user_pass', PASSWORD);
    try {
      await Promise.all([page.waitForURL((url) => url.pathname.startsWith('/wp-admin/'), { timeout: 30000, waitUntil: 'commit' }), page.click('#wp-submit')]);
      break;
    } catch (error) {
      note(`login attempt ${attempt} for ${user} did not reach wp-admin`, await page.locator('#login_error').innerText().catch(() => '(no login error shown)'));
      if (attempt === 2) throw error;
    }
  }
  return { context, page };
}

const go = async (page, step) => {
  await page.goto(`${WIZARD}&step=${step}`, { waitUntil: 'load', timeout: 60000 });
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
const saveReview = async (page) => {
  await Promise.all([page.waitForLoadState('load'), page.click('.blixis-setup-actions button[name="intent"][value="save"]')]);
  await page.waitForLoadState('load');
};
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

  check('every colour has a picker, a format menu, and a contrast list', (await page.locator('.blixis-ctl-picker').count()) === 10 && (await page.locator('select.blixis-ctl-format-select').count()) === 10 && (await page.locator('.blixis-ctl-contrast').count()) === 10);
  check('the format switch is a native select with hex, RGB, HSL, OKLCH', JSON.stringify(await page.locator('select.blixis-ctl-format-select').first().locator('option').allTextContents()) === JSON.stringify(['Hex', 'RGB', 'HSL', 'OKLCH']));
  check('the colours are cards with a tinted header, an icon, and the wave', (await page.locator('#blixis-section-colors .blixis-card__head svg.blixis-card__icon[aria-hidden="true"]').count()) === 1 && (await page.locator('#blixis-section-colors .blixis-card__wave').count()) === 1 && (await page.locator('#blixis-section-colors .blixis-row').count()) === 5);
  const darkSwitch = page.getByRole('switch', { name: 'Use dark colours' });
  check('the dark colours have a switch, off when there is no dark palette, and their rows are hidden', (await darkSwitch.count()) === 1 && !(await darkSwitch.isChecked()) && !(await page.locator('#blixis-section-colorsdark .blixis-dark-rows').isVisible()));

  check('the generic help shows once per card, not under every colour row', (await page.locator('#blixis-section-colors .blixis-row__help').count()) === 0 && (await page.locator('#blixis-section-colors .blixis-card__intro').count()) === 1);
  check('row labels align with the top of their control', await page.evaluate(() => {
    const row = document.querySelector('#blixis-section-colors .blixis-row');
    const label = row.querySelector('.blixis-row__label').getBoundingClientRect();
    const control = row.querySelector('.blixis-row__control').getBoundingClientRect();
    return Math.abs(label.top - control.top) < 14;
  }));
  check('the preview width is a three-way segmented control', JSON.stringify(await page.locator('.blixis-seg--widths .blixis-seg__opt').evaluateAll((els) => els.map((el) => el.textContent.trim().split(',')[0]))) === JSON.stringify(['Mobile', 'Tablet', 'Desktop']));
  await frameLoaded(page);
  await page.check('label[for="blixis-preview-desktop"] input');
  await settle(page);
  check('the preview frame is scaled to fit its column at the desktop width', await page.evaluate(() => {
    const box = document.querySelector('.blixis-setup-frame').getBoundingClientRect();
    const frame = document.querySelector('.blixis-setup-frame iframe').getBoundingClientRect();
    return frame.right <= box.right + 1 && frame.width > 100;
  }));
  check('the completed-step check mark is centred in its circle', await page.evaluate(() => {
    const dot = document.querySelector('.blixis-setup-progress li.is-done .blixis-setup-progress-dot');
    const text = dot.querySelector('svg').getBoundingClientRect();
    const box = dot.getBoundingClientRect();
    return Math.abs((text.left + text.right) / 2 - (box.left + box.right) / 2) < 3 && Math.abs((text.top + text.bottom) / 2 - (box.top + box.bottom) / 2) < 4;
  }));
  await page.check('label[for="blixis-preview-mobile"] input');

  const primary = page.locator('#blixis-colors-primary');
  const primaryField = field(page, 'colors', 'primary');
  await primary.fill('oklch(0.55 0.22 262)');
  check('the swatch works for OKLCH', await primaryField.locator('.blixis-setup-swatch').evaluate((el) => getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)' && !el.classList.contains('is-empty')));
  check('the picker follows an OKLCH value', /^#[0-9a-f]{6}$/.test(await primaryField.locator('.blixis-ctl-picker').inputValue()));
  check('the format menu detects OKLCH', (await primaryField.locator('select.blixis-ctl-format-select').inputValue()) === 'oklch');
  const formats = [['hex', /^#[0-9a-f]{6}$/], ['rgb', /^rgb\(\d+ \d+ \d+\)$/], ['hsl', /^hsl\([\d.]+ [\d.]+% [\d.]+%\)$/], ['oklch', /^oklch\([\d.]+ [\d.]+ [\d.]+\)$/]];
  for (const [format, pattern] of formats) {
    await primaryField.locator('select.blixis-ctl-format-select').selectOption(format);
    const text = await primary.inputValue();
    check(`switching to ${format} rewrites the value in that format`, pattern.test(text), text);
  }
  await primary.fill('#155dfc');
  await primaryField.locator('.blixis-ctl-picker').evaluate((el) => { el.value = '#aa0000'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  check('the picker writes the colour in the current format', (await primary.inputValue()) === '#aa0000');
  await primaryField.locator('select.blixis-ctl-format-select').selectOption('rgb');
  await primaryField.locator('.blixis-ctl-picker').evaluate((el) => { el.value = '#155dfc'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  check('the picker keeps the chosen format (RGB)', (await primary.inputValue()) === 'rgb(21 93 252)', await primary.inputValue());
  await primary.fill('#155dfc');

  const fg = field(page, 'colors', 'foreground');
  const lightWarnings = page.locator('#blixis-section-colors .blixis-ctl-contrast .is-warn');
  check('the default light palette warns only for the cyan accent (interface parts, 3:1)', (await lightWarnings.count()) === 1 && /3:1/.test(await field(page, 'colors', 'accent').locator('.blixis-ctl-contrast .is-warn').innerText()));
  await page.fill('#blixis-colors-foreground', '#cccccc');
  await settle(page);
  const warn = fg.locator('.blixis-ctl-contrast .is-warn');
  check('a foreground below 4.5:1 shows a warning next to it', (await warn.count()) === 1 && /Warning/.test(await warn.innerText()) && /4\.5:1/.test(await warn.innerText()), await fg.locator('.blixis-ctl-contrast').innerText());
  check('the warning has an icon and text, not colour alone', /⚠/.test(await warn.innerText()));

  check('the dark specimen says no dark palette is set', /No dark palette/.test(await page.locator('.blixis-spec[data-scheme="dark"]').innerText()));
  await darkSwitch.check();
  const switchMark = await darkSwitch.evaluate((el) => getComputedStyle(el, '::before').content);
  check('the checked switch draws no WordPress check mark over its track', switchMark === 'none' || switchMark === 'normal', switchMark);
  check('the switch shows the dark rows, starting from the light colours', (await page.locator('#blixis-section-colorsdark .blixis-dark-rows').isVisible()) && (await page.inputValue('#blixis-colorsdark-primary')) === '#155dfc');
  check('the colour scheme is a row inside the dark card', (await page.locator('#blixis-section-colorsdark .blixis-dark-rows input[name="scheme"]').count()) === 3);
  await darkSwitch.uncheck();
  await settle(page);
  check('turning the switch off hides the rows and clears the dark palette', !(await page.locator('#blixis-section-colorsdark .blixis-dark-rows').isVisible()) && (await page.inputValue('#blixis-colorsdark-primary')) === '' && (await page.locator('#blixis-section-colorsdark .blixis-ctl-contrast li').count()) === 0);
  await darkSwitch.check();
  await page.locator('#blixis-section-colorsdark .blixis-card__foot button').click();
  check('Start from the light colours in the card footer copies the light palette', (await page.inputValue('#blixis-colorsdark-surface')) === '#ffffff');
  const dark = { primary: '#7aa2ff', surface: '#0b1220', foreground: '#e6edf7', muted: '#9aa7bd', accent: '#22d3ee' };
  for (const [key, value] of Object.entries(dark)) await page.fill(`#blixis-colorsdark-${key}`, value);
  await settle(page);
  check('a good dark palette has no warnings', (await page.locator('#blixis-section-colorsdark .blixis-ctl-contrast .is-warn').count()) === 0);
  await page.fill('#blixis-colorsdark-foreground', '#222222');
  await settle(page);
  const darkWarn = page.locator('#blixis-section-colorsdark .blixis-ctl-contrast .is-warn');
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
  check('radius and layout widths have sliders and unit menus', (await page.locator('.blixis-section-radius input[type=range]').count()) === 3 && (await page.locator('.blixis-section-layout select').count()) === 3);
  const widthUnits = await field(page, 'layout', 'contentWidth').locator('select option').allTextContents();
  check('layout widths offer px, rem, %, ch, and vw', JSON.stringify(widthUnits) === JSON.stringify(['px', 'rem', '%', 'ch', 'vw']), widthUnits.join());
  const spacingUnits = await md.locator('select option').allTextContents();
  check('spacing offers px, rem, and em', JSON.stringify(spacingUnits) === JSON.stringify(['px', 'rem', 'em']));
  check('spacing ruler, radius samples, width bars, and shadow cards are shown', (await page.locator('.blixis-spec-ruler').count()) === 1 && (await page.locator('.blixis-spec-box').count()) === 6 && (await page.locator('.blixis-spec-widths').count()) === 1);

  const sm = field(page, 'shadows', 'sm');
  const presetNames = await sm.locator('.blixis-pcard__name').allTextContents();
  check('shadow presets are None, Subtle, Soft, Medium, Strong', JSON.stringify(presetNames) === JSON.stringify(['None', 'Subtle', 'Soft', 'Medium', 'Strong']), presetNames.join());
  check('the presets are a radio group', (await sm.locator('[role=radiogroup] input[type=radio]').count()) === 5);
  await sm.locator('label.blixis-pcard', { hasText: 'Strong' }).click();
  check('choosing a preset card sets the shadow', (await hidden(page, 'shadows', 'sm')) === '0 20px 25px -5px #00000026, 0 8px 10px -6px #00000026');
  await sm.locator('summary', { hasText: 'Adjust' }).click();
  await sm.locator('.blixis-ctl-row', { hasText: 'Blur' }).locator('input[type=number]').fill('30');
  check('the Adjust panel edits the first layer', /^0 20px 30px -5px #00000026, 0 8px 10px -6px/.test(await hidden(page, 'shadows', 'sm')), await hidden(page, 'shadows', 'sm'));
  check('an adjusted shadow no longer matches a preset card', (await sm.locator('[role=radiogroup] input:checked').count()) === 0);
  await sm.locator('.blixis-ctl-row', { hasText: 'Opacity' }).locator('input[type=number]').fill('50');
  check('opacity writes the alpha into the colour', /#00000080/.test(await hidden(page, 'shadows', 'sm')), await hidden(page, 'shadows', 'sm'));
  await sm.locator('input[type=color]').evaluate((el) => { el.value = '#112233'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  check('the colour choice changes the shadow colour', /#11223380/.test(await hidden(page, 'shadows', 'sm')), await hidden(page, 'shadows', 'sm'));
  await sm.locator('label.blixis-pcard', { hasText: 'None' }).click();
  check('None sets the shadow to none', (await hidden(page, 'shadows', 'sm')) === 'none');
  await sm.locator('label.blixis-pcard', { hasText: 'Subtle' }).click();
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
  const speedLabels = await page.locator('.blixis-section-motion .blixis-row__label').allTextContents();
  check('the speeds are named Fast, Normal, Slow', JSON.stringify(speedLabels) === JSON.stringify(['Fast', 'Normal', 'Slow', 'Easing']), speedLabels.join());
  const easing = field(page, 'motion', 'easing');
  const easingNames = await easing.locator('.blixis-pcard__name').allTextContents();
  check('easing presets have plain names', JSON.stringify(easingNames) === JSON.stringify(['Smooth', 'Gentle start', 'Gentle stop', 'Linear', 'Springy']), easingNames.join());
  await easing.locator('label.blixis-pcard', { hasText: 'Springy' }).click();
  check('choosing an easing card sets the easing', (await hidden(page, 'motion', 'easing')) === 'cubic-bezier(0.34, 1.56, 0.64, 1)');
  check('the motion sample does not play by itself', (await page.evaluate(() => [...document.querySelectorAll('.blixis-motion-dot')].reduce((n, el) => n + el.getAnimations().length, 0))) === 0);
  await page.click('.blixis-spec-motion button:has-text("Play")');
  check('Play animates the sample', (await page.evaluate(() => [...document.querySelectorAll('.blixis-motion-dot')].reduce((n, el) => n + el.getAnimations().length, 0))) === 3);
  await page.screenshot({ path: 'shots/c2-motion.png', fullPage: true });
  await easing.locator('label.blixis-pcard', { hasText: 'Smooth' }).click();
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
  await sm.locator('label.blixis-pcard', { hasText: 'Medium' }).click();
  await frameLoaded(page);
  await sm.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'shots/c2-shadows-adjust.png', fullPage: true });
  await next(page);
  check('the layout step submits', page.url().includes('step=header'), page.url());
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
  check('without JavaScript shadows are plain text fields', (await page.locator('input[name="config[shadows][sm]"][type="text"]').isVisible()) && (await page.locator('.blixis-pcard').count()) === 0);
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
  await page.getByRole('switch', { name: 'Use dark colours' }).check();
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
  await go(s.page, 'theme');
  await s.page.check('input[name="choice"][value="__new"]');
  await settle(s.page);
  await shot(s.page, 'shots/e-theme-new-1280.png');
  await go(s.page, 'colors');
  await s.page.getByRole('switch', { name: 'Use dark colours' }).check();
  await s.page.fill('#blixis-colors-foreground', '#cccccc');
  await settle(s.page);
  await frameLoaded(s.page);
  await shot(s.page, 'shots/e-colors-1280.png');
  await s.page.fill('#blixis-colors-foreground', '#101828');
  await s.page.getByRole('switch', { name: 'Use dark colours' }).uncheck();
  await go(s.page, 'typography');
  await s.page.fill('#blixis-fonts-body', 'serif');
  await settle(s.page);
  await frameLoaded(s.page);
  await shot(s.page, 'shots/e-typography-combobox-1280.png');
  await s.page.keyboard.press('Escape');
  await go(s.page, 'layout');
  await frameLoaded(s.page);
  await shot(s.page, 'shots/e-spacing-1280.png');
  await s.context.close();
  s = await login(browser, USERS.en, { viewport: { width: 900, height: 900 } });
  await go(s.page, 'colors');
  await frameLoaded(s.page);
  await shot(s.page, 'shots/e-colors-900.png');
  await s.context.close();
  s = await login(browser, USERS.en, { viewport: { width: 320, height: 800 } });
  await go(s.page, 'colors');
  await frameLoaded(s.page);
  await shot(s.page, 'shots/e-colors-320.png');
  await s.context.close();
  s = await login(browser, USERS.ar, { viewport: { width: 1280, height: 900 } });
  await chooseTheme(s.page);
  await go(s.page, 'colors');
  await frameLoaded(s.page);
  await shot(s.page, 'shots/e-arabic-1280.png');
  await s.context.close();
  // The Modern admin colour scheme: the accent follows the user's choice.
  s = await login(browser, USERS.en, { viewport: { width: 1280, height: 900 } });
  for (const scheme of ['modern', 'fresh']) {
    await s.page.goto(`${BASE}/wp-admin/profile.php`);
    const radio = s.page.locator(`input[name="admin_color"][value="${scheme}"]`);
    if ((await radio.count()) === 0) {
      check(`the ${scheme} admin colour scheme is available`, false, 'profile colour option missing');
      continue;
    }
    await radio.check();
    await s.page.click('#submit');
    await s.page.waitForLoadState('load');
    if (scheme === 'modern') {
      await go(s.page, 'colors');
      await frameLoaded(s.page);
      const accent = await s.page.evaluate(() => getComputedStyle(document.querySelector('.blixis-setup')).getPropertyValue('--blixis-accent').trim());
      check('the wizard accent follows the Modern admin colour scheme', accent !== '', accent);
      await shot(s.page, 'shots/e-modern-1280.png');
    }
  }
  await s.context.close();
}

// The font picker follows the WAI-ARIA combobox pattern: keys, focus, and the value it writes.
async function comboFlow(browser) {
  const { context, page } = await login(browser, USERS.en);
  await go(page, 'typography');
  const input = page.locator('#blixis-fonts-body');
  const listbox = page.locator('#' + (await input.getAttribute('aria-controls')));
  const native = page.locator('select[name="config[fonts][body]"]');
  check('the font picker is a combobox with a listbox, closed at first', (await input.getAttribute('role')) === 'combobox' && (await input.getAttribute('aria-expanded')) === 'false' && (await input.getAttribute('aria-controls')) !== null && (await page.locator('#' + (await input.getAttribute('aria-controls'))).getAttribute('role')) === 'listbox');
  check('the native select stays in the form, hidden', (await native.count()) === 1 && !(await native.isVisible()));
  check('the combobox is named by the visible label', (await page.locator('label[for="blixis-fonts-body"]').count()) === 1);
  await input.focus();
  await page.keyboard.press('ArrowDown');
  check('Arrow Down opens the list and points at the selected option', (await input.getAttribute('aria-expanded')) === 'true' && (await listbox.locator('[role=option][aria-selected="true"]').count()) === 1 && (await input.getAttribute('aria-activedescendant')) !== null);
  const active = () => page.evaluate(() => document.getElementById(document.activeElement.getAttribute('aria-activedescendant'))?.textContent ?? '');
  const first = await active();
  await page.keyboard.press('ArrowDown');
  const second = await active();
  check('Arrow Down moves the active option', second !== first, `${first} / ${second}`);
  await page.keyboard.press('ArrowUp');
  check('Arrow Up moves it back', (await active()) === first);
  const activeId = () => input.getAttribute('aria-activedescendant');
  await page.keyboard.press('End');
  const lastId = await listbox.locator('[role=option]').last().getAttribute('id');
  check('End jumps to the last option', (await activeId()) === lastId);
  await page.keyboard.press('Home');
  check('Home jumps to the first option', (await activeId()) === (await listbox.locator('[role=option]').first().getAttribute('id')));
  await page.keyboard.press('Escape');
  check('Escape closes the list and keeps focus on the combobox', (await input.getAttribute('aria-expanded')) === 'false' && (await page.evaluate(() => document.activeElement.id)) === 'blixis-fonts-body');
  await page.keyboard.type('mono');
  const matches = await listbox.locator('[role=option]').allTextContents();
  check('typing filters the options', matches.length >= 1 && matches.every((text) => /mono/i.test(text)), matches.join());
  await page.keyboard.press('Enter');
  const chosen = await native.inputValue();
  check('Enter chooses the active option and writes it to the form', /mono/i.test(chosen) && (await input.inputValue()) === chosen && (await input.getAttribute('aria-expanded')) === 'false', chosen);
  await input.focus();
  await page.keyboard.press('ArrowDown');
  check('the selected option is marked selected', (await listbox.locator('[role=option][aria-selected="true"] .blixis-combo__name').textContent()) === chosen);
  await page.keyboard.press('Escape');
  await page.keyboard.type('zzzz');
  check('no match shows a message and no options', (await listbox.locator('[role=option]').count()) === 0 && (await listbox.locator('.blixis-combo__empty').isVisible()));
  await page.keyboard.press('Escape');
  check('Escape restores the chosen name', (await input.inputValue()) === chosen);
  await input.click();
  await listbox.locator('[role=option]', { hasText: 'serif' }).first().click();
  check('the mouse chooses an option too', /serif/.test(await native.inputValue()));
  await context.close();
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
        for (const step of ['colors', 'typography', 'layout', 'header', 'review']) {
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
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
            check(`no horizontal page overflow on the ${step} step at 320px (${locale}, ${mode})`, overflow <= 1, String(overflow));
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

// ---------------------------------------------------------------------------
// Task 03-07 Part D: the Header and footer step, the layout draft, saving and the two rollbacks.
const SWITCH = {
  sticky: 'Keep the header at the top while scrolling',
  usp: 'Show a bar of short selling points above the header',
  cta: 'Show a call-to-action button in the header',
  search: 'Show a search field in the header',
  bottom: 'Keep the footer at the bottom of the window on short pages',
  copyright: 'Show a copyright line',
  top: 'Show a link that returns to the top of the page',
};
const sw = (page, key) => page.getByRole('switch', { name: SWITCH[key] });
const layoutRevision = async (page) => {
  await go(page, 'review');
  const match = /Saved header and footer revision: (\d+)/.exec(await page.locator('.blixis-setup-form').innerText());
  return match ? Number(match[1]) : 0;
};
const previewPosts = (page) => page.waitForResponse((r) => r.url().includes('admin-post.php') && r.request().method() === 'POST' && (r.request().postData() || '').includes('blixis_setup_layout_preview'), { timeout: 15000 });

async function headerFlow(browser) {
  const { context, page } = await login(browser, USERS.en, { viewport: { width: 1280, height: 1000 } });
  await chooseTheme(page);
  const startRevision = await layoutRevision(page);
  await go(page, 'header');
  check('the step is the fifth of six, named Header and footer', (await page.locator('[aria-current="step"] > .screen-reader-text').innerText()).startsWith('Step 5 of 6') && (await page.locator('.blixis-setup-form h2').innerText()) === 'Header and footer');
  check('the step has a Header card and a Footer card', (await page.locator('#blixis-section-header .blixis-card__title').innerText()) === 'Header' && (await page.locator('#blixis-section-footer .blixis-card__title').innerText()) === 'Footer');
  check('every switch is a native checkbox with role switch and a name', (await page.locator('input[type="checkbox"][role="switch"]').count()) === 7 && (await sw(page, 'sticky').count()) === 1);
  check('the logo position and the columns are native radio groups', (await page.locator('fieldset.blixis-seg input[name="layout[header][logo]"][type="radio"]').count()) === 2 && (await page.locator('fieldset.blixis-seg input[name="layout[footer][columns]"][type="radio"]').count()) === 4);
  check('the mobile menu is a select and the contact is a textarea', (await page.locator('select[name="layout[header][mobileMenu]"]').count()) === 1 && (await page.locator('textarea[name="layout[footer][contact]"]').count()) === 1);
  check('the copyright hint names {year} and {site}', (await page.locator('#blixis-footer-copyright-hint').innerText()).includes('{year}') && (await page.locator('#blixis-footer-copyright-hint').innerText()).includes('{site}'));
  check('the preview frame is on the step', (await page.locator('.blixis-setup-preview iframe').count()) === 1);
  await frameLoaded(page);

  // Dependent rows.
  await sw(page, 'usp').setChecked(false);
  await sw(page, 'cta').setChecked(false);
  check('USP texts and button fields are hidden while their switches are off', !(await page.getByLabel('USP text 1').isVisible()) && !(await page.getByLabel('Button text').isVisible()) && !(await page.getByLabel('Button link').isVisible()));
  await sw(page, 'usp').setChecked(true);
  await sw(page, 'cta').setChecked(true);
  check('they show when the switch is on', (await page.getByLabel('USP text 1').isVisible()) && (await page.getByLabel('Button text').isVisible()));
  await page.getByLabel('USP text 1').fill('Free shipping');

  // Keyboard: Space toggles a switch, the arrow keys move through a segmented control.
  await sw(page, 'sticky').setChecked(false);
  await sw(page, 'sticky').focus();
  await page.keyboard.press('Space');
  check('Space turns a switch on', await sw(page, 'sticky').isChecked());
  await page.getByRole('group', { name: 'Footer columns' }).getByRole('radio', { name: '1', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  check('the arrow keys move through the columns', await page.getByRole('group', { name: 'Footer columns' }).getByRole('radio', { name: '2', exact: true }).isChecked());

  // Client validation: an unsafe link is refused inline and nothing is sent to the preview.
  let sent = 0;
  const count = (request) => { if (request.method() === 'POST' && (request.postData() || '').includes('blixis_setup_layout_preview')) sent++; };
  page.on('request', count);
  await page.getByLabel('Button text').fill('Get a quote');
  await page.getByLabel('Button link').fill('javascript:alert(1)');
  await page.waitForSelector('#blixis-header-cta-url-client-error', { timeout: 5000 });
  await page.waitForTimeout(900);
  check('an unsafe link shows an inline error on the field', (await page.getByLabel('Button link').getAttribute('aria-invalid')) === 'true' && (await page.locator('#blixis-header-cta-url-client-error').innerText()).includes('https://'));
  check('the invalid layout is not sent to the preview', sent === 0, String(sent));
  check('the error is linked to the field', ((await page.getByLabel('Button link').getAttribute('aria-describedby')) || '').includes('blixis-header-cta-url-client-error'));

  // A valid layout reaches the preview request as the draft, and the frame reloads.
  await page.evaluate(() => { document.querySelector('.blixis-setup-frame iframe').contentWindow.__marker = 1; });
  const response = previewPosts(page);
  await page.getByLabel('Button link').fill('  /contact ');
  const reply = await response;
  const body = (reply.request().postData() || '');
  check('a valid layout is sent to the preview endpoint, with the URL trimmed', reply.status() === 200 && /name="layout\[header\]\[cta\]\[url\]"\r?\n\r?\n\/contact\r?\n/.test(body), body.slice(0, 300));
  check('the inline error is gone', (await page.locator('[data-client-error]').count()) === 0 && (await page.getByLabel('Button link').getAttribute('aria-invalid')) === null);
  await page.waitForFunction(() => document.querySelector('.blixis-setup-frame iframe').contentWindow.__marker === undefined, null, { timeout: 15000 });
  check('the preview frame reloads to show the draft', true);
  page.off('request', count);

  // The draft survives a reload without pressing Continue.
  await go(page, 'header');
  check('the previewed draft is kept on reload', (await sw(page, 'sticky').isChecked()) && (await page.getByLabel('Button link').inputValue()) === '/contact');

  // USP texts, copyright and the rest.
  await page.getByLabel('USP text 1').fill('Free shipping');
  await page.getByLabel('USP text 2').fill('');
  await page.getByLabel('USP text 3').fill('30 days to return');
  await page.getByRole('group', { name: 'Logo position' }).getByRole('radio', { name: 'Centred' }).check();
  await sw(page, 'search').setChecked(true);
  await page.locator('select[name="layout[header][mobileMenu]"]').selectOption('always');
  await sw(page, 'bottom').setChecked(true);
  await page.getByRole('group', { name: 'Footer columns' }).getByRole('radio', { name: '3', exact: true }).check();
  await page.locator('textarea[name="layout[footer][contact]"]').fill('Main Street 1\n1234 AB Town');
  await sw(page, 'copyright').setChecked(true);
  await page.getByLabel('Copyright text').fill('© {year} {site}. All rights reserved.');
  await sw(page, 'top').setChecked(true);

  // Social links: one empty row to start, add up to six, remove one.
  const social = page.locator('[data-blixis-social] .blixis-social__item:not([hidden])');
  const add = page.getByRole('button', { name: 'Add another link' });
  const start = await social.count();
  check('the social list shows its filled rows and one empty row, with an add button', start >= 1 && (await add.isVisible()));
  while ((await social.count()) < 6) await add.click();
  check('at most six links can be added', (await social.count()) === 6 && !(await add.isVisible()));
  await page.getByLabel('Address of link 1').fill('https://mastodon.example/@acme');
  await page.getByLabel('Service of link 1').selectOption('mastodon');
  await page.getByLabel('Address of link 2').fill('http://insecure.example');
  await page.waitForSelector('[data-client-error]', { timeout: 5000 });
  check('a social link must be https', (await page.getByLabel('Address of link 2').getAttribute('aria-invalid')) === 'true');
  const removeBox = await page.getByRole('button', { name: 'Remove link 2' }).boundingBox();
  const urlBox = await page.getByLabel('Address of link 2').boundingBox();
  check('the remove button is a 2.4rem square level with its field', removeBox.width >= 37 && removeBox.height >= 37 && Math.abs(removeBox.width - removeBox.height) < 2 && Math.abs(removeBox.y - urlBox.y) < 3, JSON.stringify([removeBox, urlBox]));
  await page.getByRole('button', { name: 'Remove link 2' }).click();
  check('removing a link hides its row and clears the error', (await social.count()) === 5 && (await page.locator('[data-client-error]').count()) === 0);
  await frameLoaded(page);
  await page.screenshot({ path: 'shots/f-header-step-1280.png', fullPage: true });

  // Continue: the step is accepted and the review lists the settings.
  await next(page);
  check('the step submits to the review', page.url().includes('step=review'), page.url());
  const review = await page.locator('.blixis-setup-form').innerText();
  for (const line of ['Layout:', 'Sticky header: on', 'USP bar: Free shipping; 30 days to return', 'Logo: centred', 'Button: Get a quote (/contact)', 'Search: on', 'Menu button: on every screen', 'Columns: 3', 'Contact: Main Street 1 / 1234 AB Town', 'Social links: Mastodon https://mastodon.example/@acme', 'Copyright: © {year} {site}. All rights reserved.', 'Back to top link: on'])
    check(`the review lists "${line}"`, review.includes(line), review.slice(0, 400));
  check('the primary button offers to save', (await page.locator('button[value="save"]').innerText()).trim() === 'Save and continue');
  await page.screenshot({ path: 'shots/f-review-1280.png', fullPage: true });

  // Save: tokens, then the layout.
  await saveReview(page);
  const notice = await page.locator('.blixis-setup-notice').innerText();
  check('saving reports the layout revision', /Header and footer saved as revision \d+/.test(notice), notice);
  const saved = await layoutRevision(page);
  check('the review shows the saved layout revision', saved === startRevision + 1, `${startRevision} -> ${saved}`);
  check('the primary button says Continue once everything is saved', (await page.locator('button[value="save"]').innerText()).trim() === 'Continue');
  check('no layout rollback is offered while there is no earlier saved layout, or it is offered after a second save', (await page.locator('button[value="rollback_layout"]').count()) === (startRevision > 0 ? 1 : 0));

  // Second save: change one thing, so a previous layout exists.
  await go(page, 'header');
  await sw(page, 'search').setChecked(false);
  await next(page);
  await saveReview(page);
  check('a second save writes the next layout revision', (await layoutRevision(page)) === saved + 1);
  check('the layout rollback and the token rollback are separate buttons', (await page.locator('button[value="rollback_layout"]').count()) === 1 && (await page.locator('button[value="rollback"]').count()) <= 1);

  // Conflict: another administrator saves a change first.
  await go(page, 'header');
  await sw(page, 'sticky').setChecked(false);
  await next(page);
  const other = await login(browser, 'fixture_admin2');
  await go(other.page, 'header');
  await sw(other.page, 'search').setChecked(true);
  await next(other.page);
  await saveReview(other.page);
  check('the other administrator saves the layout', (await other.page.locator('.blixis-setup-notice').count()) === 1);
  await other.context.close();
  await go(page, 'review');
  await saveReview(page);
  const failure = await page.locator('.notice-error').innerText();
  check('a stale layout save is refused with a conflict message', failure.includes('changed elsewhere'), failure);
  await go(page, 'header');
  check('the refused layout draft is kept', !(await sw(page, 'sticky').isChecked()));
  await go(page, 'review');
  await Promise.all([page.waitForURL(/step=review/), page.click('button[value="reset"]')]);
  await go(page, 'header');
  check('discarding the draft loads the saved layout', await sw(page, 'search').isChecked());

  // Rollback of the layout only.
  await go(page, 'review');
  const before = await layoutRevision(page);
  await page.click('button[value="rollback_layout"]');
  await page.waitForLoadState('load');
  check('the layout rolls back as a new revision', (await page.locator('.blixis-setup-notice').innerText()).includes(`revision ${before + 1}`));
  await go(page, 'header');
  check('the rolled-back layout is what the step shows', !(await sw(page, 'search').isChecked()));
  await context.close();
}

async function headerNoJavaScript(browser) {
  const { context, page } = await login(browser, USERS.en, { jsDisabled: true, viewport: { width: 1280, height: 1000 } });
  await chooseTheme(page);
  await go(page, 'header');
  check('without JavaScript every row is visible', (await page.getByLabel('USP text 1').isVisible()) && (await page.getByLabel('Button text').isVisible()) && (await page.getByLabel('Copyright text').isVisible()));
  check('without JavaScript the social list has empty rows to fill in', (await page.locator('.blixis-social__item:visible').count()) >= 2);
  await sw(page, 'cta').setChecked(true);
  await page.getByLabel('Button text').fill('Contact');
  await page.getByLabel('Button link').fill('javascript:alert(1)');
  await page.getByLabel('Address of link 1').fill('http://insecure.example');
  await next(page);
  check('without JavaScript the server refuses the step and stays on it', page.url().includes('step=header') && (await page.locator('#blixis-setup-errors').count()) === 1);
  const links = await page.locator('#blixis-setup-errors a').evaluateAll((els) => els.map((el) => [el.textContent, el.getAttribute('href')]));
  check('the error summary names and links the fields', links.some(([text, href]) => text.startsWith('Button link') && href === '#blixis-header-cta-url') && links.some(([text, href]) => text.startsWith('Social link') && href === '#blixis-footer-social-0-url'), JSON.stringify(links));
  check('the rejected values are shown again', (await page.getByLabel('Button link').inputValue()) === 'javascript:alert(1)' && (await page.getByLabel('Address of link 1').inputValue()) === 'http://insecure.example');
  check('each error is tied to its field', (await page.getByLabel('Button link').getAttribute('aria-invalid')) === 'true' && ((await page.getByLabel('Button link').getAttribute('aria-describedby')) || '').includes('blixis-header-cta-url-error'));
  await page.getByLabel('Button link').fill('/contact');
  await page.getByLabel('Address of link 1').fill('');
  await sw(page, 'usp').setChecked(true);
  for (const n of [1, 2, 3]) await page.getByLabel(`USP text ${n}`).fill('');
  await next(page);
  const uspSummary = await page.locator('#blixis-setup-errors').innerText().catch(() => '(no summary)');
  check('an enabled USP bar without a text is refused', page.url().includes('step=header') && uspSummary.includes('USP texts'), `${page.url()} ${uspSummary}`);
  await sw(page, 'usp').setChecked(false);
  await next(page);
  check('without JavaScript a valid step moves on to the review', page.url().includes('step=review'), page.url());
  await context.close();
}

async function headerPermissions(browser) {
  const editor = await login(browser, 'fixture_editor');
  const stepPost = await editor.page.request.post(POST, { form: { action: 'blixis_setup', step: 'header', 'layout[header][logo]': 'center' }, maxRedirects: 0 });
  check('an editor cannot submit the Header and footer step', stepPost.status() === 403, String(stepPost.status()));
  const previewPost = await editor.page.request.post(POST, { form: { action: 'blixis_setup_layout_preview', _wpnonce: 'deadbeef00' }, maxRedirects: 0 });
  check('an editor cannot use the layout preview endpoint', previewPost.status() === 403, String(previewPost.status()));
  await editor.context.close();
  const sub = await login(browser, 'fixture_subscriber');
  const subPost = await sub.page.request.post(POST, { form: { action: 'blixis_setup_layout_preview', _wpnonce: 'deadbeef00' }, maxRedirects: 0 });
  check('a subscriber cannot use the layout preview endpoint', subPost.status() === 403, String(subPost.status()));
  await sub.context.close();
  const { context, page } = await login(browser, USERS.en);
  await chooseTheme(page);
  await go(page, 'header');
  const stepNonce = await page.inputValue('.blixis-setup-form input[name="_wpnonce"]');
  const forged = await page.request.post(POST, { form: { action: 'blixis_setup_layout_preview', _wpnonce: 'deadbeef00', 'layout[header][logo]': 'center' }, maxRedirects: 0 });
  check('a forged nonce cannot use the layout preview endpoint', forged.status() === 403, String(forged.status()));
  const noNonce = await page.request.post(POST, { form: { action: 'blixis_setup', step: 'header' }, maxRedirects: 0 });
  check('a Header and footer submission without a nonce is refused', noNonce.status() === 403, String(noNonce.status()));
  const wrongStep = await page.request.post(POST, { form: { action: 'blixis_setup_layout_preview', _wpnonce: stepNonce }, maxRedirects: 0 });
  check('a nonce of another action is refused by the preview endpoint', wrongStep.status() === 403, String(wrongStep.status()));
  const data = JSON.parse(await page.locator('#blixis-setup-data').evaluate((el) => el.textContent));
  const nonce = data.layoutPreview.nonce;
  const bad = await page.request.post(POST, { form: { action: 'blixis_setup_layout_preview', _wpnonce: nonce, 'layout[header][logo]': 'left', 'layout[header][mobileMenu]': 'mobile', 'layout[footer][columns]': '9' }, maxRedirects: 0 });
  const badBody = await bad.json();
  check('the preview endpoint validates on the server and stores nothing', bad.status() === 422 && badBody.ok === false && badBody.errors.some((e) => e.code === 'header.logo.invalid') && badBody.errors.some((e) => e.code === 'footer.columns.invalid'), JSON.stringify(badBody));
  const anon = await (await import('playwright')).request.newContext();
  const anonPost = await anon.post(POST, { form: { action: 'blixis_setup_layout_preview', _wpnonce: nonce }, maxRedirects: 0 });
  check('a visitor who is not signed in gets nothing from the preview endpoint', anonPost.status() >= 400, String(anonPost.status()));
  await anon.dispose();
  await context.close();
}

async function headerShots(browser) {
  const narrow = await login(browser, USERS.en, { viewport: { width: 320, height: 900 } });
  await chooseTheme(narrow.page);
  await go(narrow.page, 'header');
  await sw(narrow.page, 'cta').setChecked(true);
  await shot(narrow.page, 'shots/f-header-step-320.png');
  await narrow.context.close();
  // Focus look of the fields: no extra ring, an accent border and a light tint instead.
  const focus = await login(browser, USERS.en, { viewport: { width: 900, height: 900 } });
  await chooseTheme(focus.page);
  await go(focus.page, 'header');
  await focus.page.getByLabel('Contact').focus();
  const look = await focus.page.evaluate(() => { const s = getComputedStyle(document.activeElement); return { shadow: s.boxShadow, border: s.borderColor }; });
  check('a focused field has no box-shadow ring and keeps a visible border colour', look.shadow === 'none' && look.border !== 'rgb(140, 143, 148)', JSON.stringify(look));
  const resting = await focus.page.evaluate(() => [...document.querySelectorAll('.blixis-setup-form input[type="text"], .blixis-setup-form select, .blixis-setup-form textarea')].filter((el) => getComputedStyle(el).boxShadow !== 'none').length);
  check('no form field has a resting shadow', resting === 0, String(resting));
  await focus.page.locator('#blixis-section-footer').scrollIntoViewIfNeeded();
  await shot(focus.page, process.env.T0306_FOCUS_SHOT || 'shots/f-focus.png');
  await focus.context.close();
  const ar = await login(browser, USERS.ar, { viewport: { width: 1280, height: 1000 } });
  await chooseTheme(ar.page);
  await go(ar.page, 'header');
  await frameLoaded(ar.page);
  await shot(ar.page, 'shots/f-header-step-arabic.png');
  const direction = await ar.page.evaluate(() => ({ dir: document.documentElement.dir, align: getComputedStyle(document.querySelector('.blixis-row__label')).textAlign }));
  check('the Header and footer step is right to left in Arabic', direction.dir === 'rtl', JSON.stringify(direction));
  await ar.context.close();
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
    await comboFlow(browser);
    await labelFlow(browser);
    await reducedMotionFlow(browser);
    await noJavaScriptFlow(browser);
    await permissionChecks(browser);
    await darkReview(browser);
    await headerPermissions(browser);
    await headerFlow(browser);
    await headerNoJavaScript(browser);
    if (name === 'chromium') await headerShots(browser);
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
