// Task 03-03 browser stage: drives the Blixis setup wizard in real browsers against the throwaway
// WordPress site. Prints PASS/FAIL/NOTE lines and ends with DONE-BROWSER.
// The first browser runs the full flow (create, errors, recovery, save, conflict); later browsers
// repeat the read-only checks (keyboard, accessibility, locale, permissions) on the same site.
import { chromium, firefox } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:8080';
const WIZARD = `${BASE}/wp-admin/themes.php?page=blixis-setup`;
const PASSWORD = process.env.T0303_ADMIN_PASSWORD;
const AXE = readFileSync('vendor/axe.min.js', 'utf8');
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
  // Land on the wizard, not the dashboard, whose widgets call WordPress.org. Match the path:
  // the login URL itself contains wp-admin in its redirect_to parameter.
  // Firefox in CI occasionally submitted the form before wp-login.php had finished loading its
  // scripts, so the login silently failed and the wait below timed out. Wait for the full load,
  // and retry once, reporting what the login page said.
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
  check(`axe-core finds no violations in the wizard: ${label}`, result.length === 0, result.join(' || '));
}

async function noOverflow(page, label) {
  const r = await page.evaluate(() => {
    const el = document.querySelector('.blixis-setup');
    const box = el.getBoundingClientRect();
    return { scroll: el.scrollWidth, client: el.clientWidth, right: Math.round(box.right), vw: document.documentElement.clientWidth };
  });
  check(`wizard does not overflow horizontally: ${label}`, r.scroll <= r.client + 1 && r.right <= r.vw + 1, JSON.stringify(r));
}

const currentStep = (page) => page.locator('[aria-current="step"]').innerText();
const currentStepLabel = (page) => page.locator('[aria-current="step"] .screen-reader-text').innerText();
const value = (page, id) => page.inputValue(`#${id}`);

async function submit(page) {
  // click waits for the navigation it starts to commit.
  await page.click('.blixis-setup-actions button[value="next"], .blixis-setup-actions button[value="save"]');
  await page.waitForLoadState('load');
}

async function keyboardThemeStep(page) {
  await page.goto(WIZARD);
  const existing = page.locator('.blixis-setup-progress a[aria-current="step"]');
  check('current progress item remains a step link', (await existing.count()) === 1);
  check('new-theme fields start hidden for an existing selection', !(await page.locator('.blixis-setup-new-theme').isVisible()));
  check('hidden new-theme controls are absent from the form accessibility tree', (await page.locator('.blixis-setup-form').getByRole('textbox', { name: 'Theme name' }).count()) === 0);
  await page.locator('#blixis-theme-choice-new').check();
  check('new-theme fields appear when the new-theme radio is selected', await page.locator('.blixis-setup-new-theme').isVisible());
  await page.locator('#blixis-theme-choice-new').focus();
  const order = ['blixis-theme-choice-new'];
  let unfocusedVisible = '';
  for (let i = 0; i < 120 && order.at(-1) !== 'submit'; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || !el.closest('.blixis-setup-form')) return null;
      const s = getComputedStyle(el);
      const visible = s.outlineStyle !== 'none' || s.boxShadow !== 'none';
      return { id: el.id || (el.matches('button[value="next"]') ? 'submit' : el.tagName), visible };
    });
    if (info) {
      order.push(info.id);
      if (!info.visible) unfocusedVisible += `${info.id} `;
    }
  }
  check('keyboard reaches the theme choice, name, slug, starter, and submit in order', /blixis-theme-choice-[a-z0-9-]+ blixis-theme-name blixis-theme-slug blixis-new-starter submit/.test(order.join(' ')), order.join(' '));
  check('every focused wizard control shows a focus indicator', unfocusedVisible === '', unfocusedVisible);
  const existingRadio = page.locator('input[name="choice"]:not(#blixis-theme-choice-new)').first();
  if (await existingRadio.count()) await existingRadio.check();
}

async function fullFlow(browser) {
  const { context, page } = await login(browser, 'fixture_admin');
  await page.goto(WIZARD);
  check('wizard opens on step 1, the child theme', (await currentStepLabel(page)).startsWith('Step 1 of 5'));
  check('only the current step is linked before a theme is chosen', (await page.locator('.blixis-setup-progress a').count()) === 1 && (await page.locator('.blixis-setup-progress a[aria-current="step"]').count()) === 1);
  await axe(page, 'theme step');
  await page.screenshot({ path: 'shots/c1-theme-existing-1280.png', fullPage: true });
  check('existing-theme action says Continue', (await page.locator('button[value="next"]').innerText()) === 'Continue');
  check('button exposes all translated label values', (await page.getAttribute('button[value="next"]', 'data-label-create')) === 'Create theme and continue' && (await page.getAttribute('button[value="next"]', 'data-label-save')) === 'Save and continue');

  // Keyboard only: choose "new", type an invalid slug, submit with Enter.
  await keyboardThemeStep(page);
  await page.focus('#blixis-theme-choice-new');
  await page.keyboard.press('Space');
  await page.screenshot({ path: 'shots/c1-theme-new-1280.png', fullPage: true });
  check('CSS switches the action label for the selected new-theme radio', (await page.locator('button[value="next"]').innerText()) === 'Create theme and continue');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Acme Site');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Bad Slug');
  await Promise.all([page.waitForURL(/step=theme/), page.keyboard.press('Enter')]);
  await page.waitForLoadState('load');
  check('an invalid slug shows the error summary', await page.locator('#blixis-setup-errors').isVisible());
  check('focus moves to the error summary', (await page.evaluate(() => document.activeElement?.id)) === 'blixis-setup-errors');
  check('the invalid field is marked and described', (await page.getAttribute('#blixis-theme-slug', 'aria-invalid')) === 'true' && (await page.getAttribute('#blixis-theme-slug', 'aria-describedby')).includes('blixis-theme-slug-error'));
  check('validation errors force the new-theme fieldset visible', await page.locator('.blixis-setup-new-theme.has-errors').isVisible());
  check('typed values are kept after an error', (await value(page, 'blixis-theme-slug')) === 'Bad Slug' && (await value(page, 'blixis-theme-name')) === 'Acme Site');
  check('server selects Create theme and continue after a rejected new-theme submit', (await page.locator('button[value="next"]').innerText()) === 'Create theme and continue');
  await axe(page, 'theme step with errors');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  check('the summary link moves focus to the field', (await page.evaluate(() => document.activeElement?.id)) === 'blixis-theme-slug');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.type('acme-site');
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
  await Promise.all([page.waitForURL(/step=colors/), page.keyboard.press('Enter')]);
  check('a valid theme moves on to the colours step', (await currentStepLabel(page)).startsWith('Step 2 of 5'));
  check('the theme step is marked completed', (await page.locator('.blixis-setup-progress li.is-done').count()) === 1);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'shots/colors-1280.png', fullPage: true });

  // Error state on a token step: CSS injection.
  await page.fill('#blixis-colors-primary', 'red;}body{display:none}');
  await submit(page);
  check('CSS injection in a colour is refused with a field error', (await page.getAttribute('#blixis-colors-primary', 'aria-invalid')) === 'true');
  check('the rejected value is shown again unchanged', (await value(page, 'blixis-colors-primary')) === 'red;}body{display:none}');
  check('the error message names the field and the rule', (await page.locator('#blixis-setup-errors').innerText()).includes('Primary'));
  await axe(page, 'colours step with errors');
  await page.fill('#blixis-colors-primary', '#123456');
  await submit(page);
  check('a valid colour moves on to typography', (await currentStepLabel(page)).startsWith('Step 3 of 5'));
  await page.click('.blixis-setup-progress a:has-text("Step 2 of 5")');
  check('changed step action says Save and continue', (await page.locator('button[value="next"]').innerText()) === 'Save and continue');
  await page.waitForLoadState('load');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'shots/c1-changes-save.png', fullPage: true });
  await page.goto(`${WIZARD}&step=typography`);

  // Recovery: reload, go back, and a new session.
  await page.reload();
  check('a reload stays on the same step', (await currentStepLabel(page)).startsWith('Step 3 of 5'));
  await page.click('.blixis-setup-progress a:has-text("Step 2 of 5")');
  check('going back shows the saved draft value', (await value(page, 'blixis-colors-primary')) === '#123456');
  await context.close();
  const again = await login(browser, 'fixture_admin');
  await again.page.goto(`${WIZARD}&step=colors`);
  check('a new session resumes the draft', (await value(again.page, 'blixis-colors-primary')) === '#123456');
  const page2 = again.page;
  await submit(page2);
  await submit(page2);
  await submit(page2);
  check('the review step is reached', (await currentStepLabel(page2)).startsWith('Step 5 of 5'));
  check('review says nothing is saved yet', (await page2.locator('.blixis-setup-form').innerText()).includes('Nothing is saved yet'));
  check('review action names the unsaved draft', (await page2.locator('button[value="save"]').innerText()) === 'Save and continue');
  await axe(page2, 'review step');
  await submit(page2);
  check('saving reports revision 1', (await page2.locator('.blixis-setup-notice').innerText()).includes('revision 1'));
  check('review action says Continue after saving the unchanged draft', (await page2.locator('button[value="save"]').innerText()) === 'Continue');

  // Conflict: this administrator edits, another saves first.
  await page2.goto(`${WIZARD}&step=colors`);
  await page2.fill('#blixis-colors-primary', '#222222');
  await submit(page2);
  const other = await login(browser, 'fixture_admin2');
  await other.page.goto(`${WIZARD}&step=colors`);
  check('another administrator starts from the saved values', (await value(other.page, 'blixis-colors-primary')) === '#123456');
  await other.page.fill('#blixis-colors-primary', '#0A7A3F');
  await submit(other.page);
  await other.page.goto(`${WIZARD}&step=review`);
  await submit(other.page);
  check('the other administrator saves revision 2', (await other.page.locator('.blixis-setup-notice').innerText()).includes('revision 2'));
  await other.context.close();

  await page2.goto(`${WIZARD}&step=review`);
  await submit(page2);
  check('a stale save is refused with a conflict message', (await page2.locator('.notice-error').innerText()).includes('changed elsewhere'));
  await page2.goto(`${WIZARD}&step=colors`);
  check('the refused draft is kept', (await value(page2, 'blixis-colors-primary')) === '#222222');
  await page2.goto(`${WIZARD}&step=review`);
  await Promise.all([page2.waitForURL(/step=review/), page2.click('button[value="reset"]')]);
  const review = await page2.locator('.blixis-setup-form').innerText();
  check('discarding the draft loads the saved values', review.includes('Saved revision: 2') && review.includes('#0a7a3f'), review.slice(0, 300));

  // CSRF and permissions: requests that must change nothing.
  const forged = await page2.request.post(`${BASE}/wp-admin/admin-post.php`, { form: { action: 'blixis_setup', step: 'theme', choice: '__new', new_name: 'Evil', new_slug: 'evil-site' }, maxRedirects: 0 });
  check('a submission without a nonce is refused (403)', forged.status() === 403, String(forged.status()));
  await again.context.close();
}

async function readOnlyChecks(browser, label) {
  const { context, page } = await login(browser, 'fixture_admin');
  await page.goto(WIZARD);
  check(`the wizard opens (${label})`, (await page.locator('.blixis-setup h1').innerText()) === 'Blixis setup');
  await keyboardThemeStep(page);
  await axe(page, `theme step (${label})`);
  await page.goto(`${WIZARD}&step=colors`);
  await noOverflow(page, `tabs and two-column shell at 1280px (${label})`);
  const desktopShell = await page.evaluate(() => {
    const links = [...document.querySelectorAll('.blixis-setup-progress li a')];
    const oneLine = links.every((link) => ['.blixis-setup-progress-number', '.blixis-setup-progress-name'].every((selector) => {
      const el = link.querySelector(selector);
      return getComputedStyle(el).whiteSpace === 'nowrap';
    }));
    const aside = document.querySelector('.blixis-setup-layout__preview');
    const form = document.querySelector('.blixis-setup-layout__form');
    return { linkCount: links.length, oneLine, sticky: getComputedStyle(aside).position === 'sticky', beside: aside.getBoundingClientRect().left >= form.getBoundingClientRect().right - 1 };
  });
  check(`five progress links keep each line to one line at 1280px (${label})`, desktopShell.linkCount === 5 && desktopShell.oneLine, JSON.stringify(desktopShell));
  check(`preview is sticky beside the form at 1280px (${label})`, desktopShell.sticky && desktopShell.beside, JSON.stringify(desktopShell));
  for (const step of ['colors', 'typography', 'layout', 'review']) {
    await page.goto(`${WIZARD}&step=${step}`);
    await axe(page, `${step} step at 1280px (${label})`);
  }
  await context.close();

  const narrow = await login(browser, 'fixture_admin', { width: 320, height: 800 });
  await narrow.page.goto(`${WIZARD}&step=colors`);
  const narrowTabs = await narrow.page.evaluate(() => ({
    visible: [...document.querySelectorAll('.blixis-setup-progress li')].filter((li) => getComputedStyle(li).display !== 'none').length,
    current: document.querySelector('.blixis-setup-progress li.is-current .blixis-setup-mobile-count')?.innerText.trim().toLowerCase(),
  }));
  check(`only the current progress tab shows as Step N of 5 at 320px (${label})`, narrowTabs.visible === 1 && narrowTabs.current === 'of 5', JSON.stringify(narrowTabs));
  await noOverflow(narrow.page, `progress tabs at 320px (${label})`);
  for (const step of ['theme', 'colors', 'layout', 'review']) {
    await narrow.page.goto(`${WIZARD}&step=${step}`);
    await noOverflow(narrow.page, `${step} at 320px`);
    await axe(narrow.page, `${step} step at 320px (${label})`);
  }
  await narrow.page.goto(WIZARD);
  await narrow.page.screenshot({ path: 'shots/c1-progress-320.png', fullPage: true });
  await narrow.page.screenshot({ path: `shots/review-320-${label}.png`, fullPage: true });
  await narrow.context.close();

  const medium = await login(browser, 'fixture_admin', { width: 800, height: 900 });
  await medium.page.goto(`${WIZARD}&step=colors`);
  const mediumShell = await medium.page.evaluate(() => {
    const aside = document.querySelector('.blixis-setup-layout__preview');
    const form = document.querySelector('.blixis-setup-layout__form');
    return { columns: getComputedStyle(document.querySelector('.blixis-setup-layout')).gridTemplateColumns, previewPosition: getComputedStyle(aside).position, under: aside.getBoundingClientRect().top >= form.getBoundingClientRect().bottom - 1 };
  });
  check(`preview moves below the form at 800px (${label})`, mediumShell.previewPosition !== 'sticky' && mediumShell.under && !mediumShell.columns.includes(' 23.75rem'), JSON.stringify(mediumShell));
  await noOverflow(medium.page, `two-column shell collapse at 800px (${label})`);
  await medium.context.close();

  if (label === 'chromium') {
    const scheme = await login(browser, 'fixture_admin');
    await scheme.page.goto(`${BASE}/wp-admin/profile.php`);
    const modern = scheme.page.locator('input[name="admin_color"][value="modern"]');
    if (await modern.count()) {
      await modern.check();
      await scheme.page.click('#submit');
      await scheme.page.waitForLoadState('load');
      await scheme.page.goto(`${WIZARD}&step=colors`);
      const accent = await scheme.page.locator('.blixis-setup').evaluate((el) => getComputedStyle(el).getPropertyValue('--blixis-admin-accent').trim());
      check('admin accent follows the Modern colour scheme', accent === '#3858e9', accent);
    } else {
      check('Modern admin colour scheme is available in WordPress 7.x', false, 'profile colour option missing');
    }
    await scheme.context.close();
  }

  const dutch = await login(browser, 'fixture_nl');
  await dutch.page.goto(`${WIZARD}&step=colors`);
  check('Dutch admin renders the wizard with lang nl', (await dutch.page.getAttribute('html', 'lang'))?.startsWith('nl'));
  await axe(dutch.page, `colours step in Dutch (${label})`);
  await dutch.context.close();

  const arabic = await login(browser, 'fixture_ar', { width: 320, height: 800 });
  await arabic.page.goto(WIZARD);
  check('Arabic admin renders the wizard right to left', (await arabic.page.getAttribute('html', 'dir')) === 'rtl');
  await arabic.page.goto(`${WIZARD}&step=colors`);
  check('token values stay left to right inside the right-to-left page', (await arabic.page.getAttribute('#blixis-colors-primary', 'dir')) === 'ltr');
  await noOverflow(arabic.page, 'Arabic at 320px');
  await axe(arabic.page, `colours step in Arabic (${label})`);
  await arabic.page.goto(WIZARD);
  await noOverflow(arabic.page, 'Arabic theme progress at 320px');
  await arabic.page.screenshot({ path: 'shots/c1-progress-ar-rtl.png', fullPage: true });
  await arabic.context.close();

  for (const user of ['fixture_editor', 'fixture_subscriber']) {
    const denied = await login(browser, user);
    const response = await denied.page.goto(WIZARD);
    check(`${user} cannot open the wizard (403)`, response.status() === 403 && (await denied.page.locator('.blixis-setup-form').count()) === 0, String(response.status()));
    const post = await denied.page.request.post(`${BASE}/wp-admin/admin-post.php`, { form: { action: 'blixis_setup', step: 'theme', choice: '__new', new_name: 'Evil', new_slug: 'evil-site' }, maxRedirects: 0 });
    check(`${user} cannot submit a step (403)`, post.status() === 403, String(post.status()));
    await denied.context.close();
  }
  const anonymous = await browser.newContext();
  const anon = await anonymous.request.post(`${BASE}/wp-admin/admin-post.php`, { form: { action: 'blixis_setup', step: 'theme', choice: '__new', new_name: 'Evil', new_slug: 'evil-site' }, maxRedirects: 0 });
  check('an anonymous submission does nothing', anon.status() !== 200 || !(await anon.text()).includes('blixis-setup'), String(anon.status()));
  await anonymous.close();

  const nojs = await browser.newContext({ viewport: { width: 1280, height: 900 }, javaScriptEnabled: false });
  const nojsPage = await nojs.newPage();
  await nojsPage.goto(`${BASE}/wp-login.php?redirect_to=${encodeURIComponent(WIZARD)}`);
  await nojsPage.fill('#user_login', 'fixture_admin');
  await nojsPage.fill('#user_pass', PASSWORD);
  await Promise.all([nojsPage.waitForURL((url) => url.pathname.startsWith('/wp-admin/'), { timeout: 60000, waitUntil: 'commit' }), nojsPage.click('#wp-submit')]);
  await nojsPage.goto(WIZARD);
  check('without JavaScript, existing-theme fields are hidden and the step is usable', !(await nojsPage.locator('.blixis-setup-new-theme').isVisible()) && (await nojsPage.locator('button[value="next"]').innerText()) === 'Continue');
  await nojsPage.locator('#blixis-theme-choice-new').check();
  check('without JavaScript, CSS reveals the new-theme fields', await nojsPage.locator('.blixis-setup-new-theme').isVisible());
  check('without JavaScript, the new-theme action label changes', (await nojsPage.locator('button[value="next"]').innerText()) === 'Create theme and continue');
  await nojsPage.screenshot({ path: 'shots/c1-js-off.png', fullPage: true });
  await nojs.close();
}

const names = (process.env.T0303_BROWSERS || 'chromium').split(',').filter(Boolean);
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
