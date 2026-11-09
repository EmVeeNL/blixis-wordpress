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
  await page.goto(`${BASE}/wp-login.php?redirect_to=${encodeURIComponent(WIZARD)}`);
  await page.fill('#user_login', user);
  await page.fill('#user_pass', PASSWORD);
  await Promise.all([page.waitForURL((url) => url.pathname.startsWith('/wp-admin/'), { timeout: 60000 }), page.click('#wp-submit')]);
  return { context, page };
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
const value = (page, id) => page.inputValue(`#${id}`);

async function submit(page) {
  // click waits for the navigation it starts to commit.
  await page.click('.blixis-setup-actions button[value="next"], .blixis-setup-actions button[value="save"]');
  await page.waitForLoadState('load');
}

async function keyboardThemeStep(page) {
  await page.goto(WIZARD);
  await page.locator('body').focus();
  const order = [];
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
  check('keyboard reaches the theme choice, name, slug, and submit in order', /blixis-theme-choice-[a-z0-9-]+ blixis-theme-name blixis-theme-slug submit/.test(order.join(' ')), order.join(' '));
  check('every focused wizard control shows a focus indicator', unfocusedVisible === '', unfocusedVisible);
}

async function fullFlow(browser) {
  const { context, page } = await login(browser, 'fixture_admin');
  await page.goto(WIZARD);
  check('wizard opens on step 1, the child theme', (await currentStep(page)).startsWith('Step 1 of 5'));
  check('later steps are not links before a theme is chosen', (await page.locator('.blixis-setup-progress a').count()) === 0);
  await axe(page, 'theme step');

  // Keyboard only: choose "new", type an invalid slug, submit with Enter.
  await keyboardThemeStep(page);
  await page.focus('#blixis-theme-choice-new');
  await page.keyboard.press('Space');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Acme Site');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Bad Slug');
  await Promise.all([page.waitForURL(/step=theme/), page.keyboard.press('Enter')]);
  await page.waitForLoadState('load');
  check('an invalid slug shows the error summary', await page.locator('#blixis-setup-errors').isVisible());
  check('focus moves to the error summary', (await page.evaluate(() => document.activeElement?.id)) === 'blixis-setup-errors');
  check('the invalid field is marked and described', (await page.getAttribute('#blixis-theme-slug', 'aria-invalid')) === 'true' && (await page.getAttribute('#blixis-theme-slug', 'aria-describedby')).includes('blixis-theme-slug-error'));
  check('typed values are kept after an error', (await value(page, 'blixis-theme-slug')) === 'Bad Slug' && (await value(page, 'blixis-theme-name')) === 'Acme Site');
  await axe(page, 'theme step with errors');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  check('the summary link moves focus to the field', (await page.evaluate(() => document.activeElement?.id)) === 'blixis-theme-slug');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.type('acme-site');
  await Promise.all([page.waitForURL(/step=colors/), page.keyboard.press('Enter')]);
  check('a valid theme moves on to the colours step', (await currentStep(page)).startsWith('Step 2 of 5'));
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
  check('a valid colour moves on to typography', (await currentStep(page)).startsWith('Step 3 of 5'));

  // Recovery: reload, go back, and a new session.
  await page.reload();
  check('a reload stays on the same step', (await currentStep(page)).startsWith('Step 3 of 5'));
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
  check('the review step is reached', (await currentStep(page2)).startsWith('Step 5 of 5'));
  check('review says nothing is saved yet', (await page2.locator('.blixis-setup-form').innerText()).includes('Nothing is saved yet'));
  await axe(page2, 'review step');
  await submit(page2);
  check('saving reports revision 1', (await page2.locator('.blixis-setup-notice').innerText()).includes('revision 1'));

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
  for (const step of ['colors', 'typography', 'layout', 'review']) {
    await page.goto(`${WIZARD}&step=${step}`);
    await axe(page, `${step} step at 1280px (${label})`);
  }
  await context.close();

  const narrow = await login(browser, 'fixture_admin', { width: 320, height: 800 });
  for (const step of ['theme', 'colors', 'layout', 'review']) {
    await narrow.page.goto(`${WIZARD}&step=${step}`);
    await noOverflow(narrow.page, `${step} at 320px`);
    await axe(narrow.page, `${step} step at 320px (${label})`);
  }
  await narrow.page.screenshot({ path: `shots/review-320-${label}.png`, fullPage: true });
  await narrow.context.close();

  const dutch = await login(browser, 'fixture_nl');
  await dutch.page.goto(`${WIZARD}&step=colors`);
  check('Dutch admin renders the wizard with lang nl', (await dutch.page.getAttribute('html', 'lang'))?.startsWith('nl'));
  await axe(dutch.page, `colours step in Dutch (${label})`);
  await dutch.context.close();

  const arabic = await login(browser, 'fixture_ar', { width: 320, height: 800 });
  await arabic.page.goto(`${WIZARD}&step=colors`);
  check('Arabic admin renders the wizard right to left', (await arabic.page.getAttribute('html', 'dir')) === 'rtl');
  check('token values stay left to right inside the right-to-left page', (await arabic.page.getAttribute('#blixis-colors-primary', 'dir')) === 'ltr');
  await noOverflow(arabic.page, 'Arabic at 320px');
  await axe(arabic.page, `colours step in Arabic (${label})`);
  await arabic.page.screenshot({ path: `shots/colors-ar-320-${label}.png`, fullPage: true });
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
