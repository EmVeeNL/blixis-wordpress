import { chromium, firefox } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
const browsers = (process.env.T0307_BROWSERS || 'chromium').split(',');
const out = process.env.T0307_OUT || '/work/shots';
await mkdir(out, { recursive: true });
const axe = await readFile('/work/vendor/axe.min.js', 'utf8');
let failures = 0;
const check = (ok, label, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? `: ${detail}` : ''}`); if (!ok) failures++; };
const layouts = ['blank', 'business', 'portfolio', 'blog', 'landing'];
for (const name of browsers) {
  const type = name === 'firefox' ? firefox : chromium;
  const browser = await type.launch({ headless: true });
  for (const layout of layouts) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'en-US' });
    const external = [];
    page.on('request', (request) => { if (!request.url().startsWith('http://127.0.0.1:8080') && !request.url().startsWith('data:') && !request.url().startsWith('blob:http://127.0.0.1:8080/')) external.push(request.url()); });
    await page.goto(`http://127.0.0.1:8080/?t0307_layout=${layout}`, { waitUntil: 'networkidle' });
    check(await page.locator('main').count() === 1, `${name} ${layout} one main`);
    check(await page.locator('main h1').count() === 1, `${name} ${layout} one h1`);
    check(await page.locator('a.skip-link, .skip-link').count() > 0, `${name} ${layout} skip link`);
    check((await page.locator('nav').evaluateAll((els) => els.every((el) => el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby')))), `${name} ${layout} labelled navigation`);
    if (layout === 'business') check(await page.locator('main .wp-block-button a').count() >= 2, `${name} business hero buttons`);
    if (layout === 'portfolio') check(await page.locator('#projects > .wp-block-group > .wp-block-group').count() === 6, `${name} portfolio six cards`);
    if (layout === 'landing') {
      check(await page.locator('nav[aria-label="On this page"]').count() === 1, `${name} landing in-page navigation label`);
      check(await page.locator('#faq details').count() >= 2, `${name} landing FAQ details`);
      check(await page.locator('#contact h2').count() === 1, `${name} landing final CTA heading`);
    }
    if (layout === 'blog') {
      const count = await page.locator('.wp-block-post-title').count();
      if (new URL(page.url()).searchParams.has('t0307_posts')) check(count > 0, `${name} blog featured card with posts`);
      else {
        check(await page.getByText('No posts yet. Check back soon for the latest stories.').count() === 1, `${name} blog no-results message`);
        await page.goto('http://127.0.0.1:8080/?t0307_layout=blog&t0307_posts=1', { waitUntil: 'networkidle' });
        const featuredCount = await page.locator('main .wp-block-query').first().locator('.wp-block-post-title').count();
        check(featuredCount === 1, `${name} blog featured card with posts`, `titles=${featuredCount}`);
        await page.goto('http://127.0.0.1:8080/?t0307_layout=blog', { waitUntil: 'networkidle' });
      }
    }
    await page.addScriptTag({ content: axe });
    let violations = await page.evaluate(async () => (await axe.run(document)).violations.map((v) => `${v.id}:${v.nodes.map((n) => n.target.join(' ')).join('|')}`));
    check(violations.length === 0, `${name} ${layout} axe 1280`, violations.join(','));
    await page.screenshot({ path: `${out}/layout-${layout}-1280.png`, fullPage: true });
    await page.setViewportSize({ width: 320, height: 760 });
    await page.waitForTimeout(100);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} ${layout} no overflow 320`);
    violations = await page.evaluate(async () => (await axe.run(document)).violations.map((v) => `${v.id}:${v.nodes.map((n) => n.target.join(' ')).join('|')}`));
    check(violations.length === 0, `${name} ${layout} axe 320`, violations.join(','));
    await page.screenshot({ path: `${out}/layout-${layout}-320.png`, fullPage: true });
    check(external.length === 0, `${name} ${layout} no external requests`, external.join(','));
    await page.close();
  }
  const arabic = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'ar' });
  await arabic.goto('http://127.0.0.1:8080/?t0307_layout=landing&t0307_locale=ar', { waitUntil: 'networkidle' });
  check((await arabic.locator('html').getAttribute('dir')) === 'rtl', `${name} landing Arabic direction`);
  await arabic.screenshot({ path: `${out}/layout-landing-1280-ar.png`, fullPage: true });
  await browser.close();
}
console.log(`DONE-BROWSER ${failures}`);
if (failures) process.exitCode = 1;
