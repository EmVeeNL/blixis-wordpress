import { chromium, firefox } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
const browsers = (process.env.T0307_BROWSERS || 'chromium').split(',');
const out = process.env.T0307_OUT || '/work/shots';
await mkdir(out, { recursive: true });
const axe = await readFile('/work/vendor/axe.min.js', 'utf8');
let failures = 0;
const check = (ok, label, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? `: ${detail}` : ''}`); if (!ok) failures++; };
const layouts = ['blank', 'business', 'portfolio', 'blog', 'landing'];
const bandSelectors = { business: ['main > .alignfull'], landing: ['main > .alignfull'] };
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
    if (layout === 'business') {
      check(await page.locator('main .wp-block-button a').count() >= 2, `${name} business hero buttons`);
      check(await page.locator('main > .alignfull h2').filter({ hasText: 'Ready to start?' }).count() === 1, `${name} business CTA heading`);
      const cards = page.locator('#features .business-feature-card');
      const heights = await cards.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
      check(new Set(heights).size === 1, `${name} business feature cards equal height`, heights.join(','));
    }
    if (layout === 'portfolio') check(await page.locator('#projects > .wp-block-group > .wp-block-group').count() === 6, `${name} portfolio six cards`);
    if (layout === 'landing') {
      check(await page.locator('nav[aria-label="On this page"]').count() === 1, `${name} landing in-page navigation label`);
      check(await page.locator('#faq details').count() >= 2, `${name} landing FAQ details`);
      check(await page.locator('#contact h2').count() === 1, `${name} landing final CTA heading`);
      check(await page.locator('nav[aria-label="On this page"]').evaluate((el) => el.getBoundingClientRect().left >= 0 && el.getBoundingClientRect().right <= innerWidth), `${name} landing navigation inside viewport`);
      await page.keyboard.press('Tab');
      for (let tab = 0; tab < 12; tab++) {
        if (await page.locator('nav[aria-label="On this page"] a').first().evaluate((el) => el === document.activeElement)) break;
        await page.keyboard.press('Tab');
      }
      check(await page.locator('nav[aria-label="On this page"] a').first().evaluate((el) => getComputedStyle(el).outlineStyle !== 'none' && parseFloat(getComputedStyle(el).outlineWidth) >= 2), `${name} landing navigation visible keyboard focus ring`);
    }
    if (layout === 'blog') {
      check(await page.getByText('No posts yet. Check back soon for the latest stories.').count() === 1, `${name} blog no-results message`);
      await page.screenshot({ path: `${out}/layout-blog-empty-1280.png`, fullPage: true });
      await page.goto('http://127.0.0.1:8080/?t0307_layout=blog&t0307_posts=1', { waitUntil: 'networkidle' });
      const queries = page.locator('main .wp-block-query');
      const featuredCount = await queries.nth(0).locator('.wp-block-post-title').count();
      const grid = queries.nth(1);
      check(featuredCount === 1, `${name} blog featured card with posts`, `titles=${featuredCount}`);
      const cardCounts = await Promise.all([grid.locator('.wp-block-post-title').count(), grid.locator('time').count(), grid.locator('.wp-block-post-excerpt').count()]);
      check(cardCounts.every((count) => count === 1), `${name} blog secondary post card title/date/excerpt`, cardCounts.join('/'));
      await page.screenshot({ path: `${out}/layout-blog-1280.png`, fullPage: true });
      await page.goto('http://127.0.0.1:8080/?t0307_layout=blog', { waitUntil: 'networkidle' });
    }
    await page.addScriptTag({ content: axe });
    let violations = await page.evaluate(async () => (await axe.run(document)).violations.map((v) => `${v.id}:${v.nodes.map((n) => n.target.join(' ')).join('|')}`));
    check(violations.length === 0, `${name} ${layout} axe 1280`, violations.join(','));
    if (bandSelectors[layout]) {
      const bounds = await page.locator(bandSelectors[layout].join(',')).evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) }; }));
      check(bounds.every((r) => r.left === 0 && r.right === 1280 && r.width === 1280), `${name} ${layout} full bleed 1280`, JSON.stringify(bounds));
    }
    if (layout !== 'blog') await page.screenshot({ path: `${out}/layout-${layout}-1280.png`, fullPage: true });
    await page.setViewportSize({ width: 320, height: 760 });
    await page.waitForTimeout(100);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} ${layout} no overflow 320`);
    if (bandSelectors[layout]) {
      for (const selector of bandSelectors[layout]) {
        const bounds = await page.locator(selector).evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) }; }));
        check(bounds.every((r) => r.left === 0 && r.right === 320 && r.width === 320), `${name} ${layout} full bleed 320`, JSON.stringify(bounds));
      }
    }
    violations = await page.evaluate(async () => (await axe.run(document)).violations.map((v) => `${v.id}:${v.nodes.map((n) => n.target.join(' ')).join('|')}`));
    check(violations.length === 0, `${name} ${layout} axe 320`, violations.join(','));
    await page.screenshot({ path: `${out}/layout-${layout}-320.png`, fullPage: true });
    check(external.length === 0, `${name} ${layout} no external requests`, external.join(','));
    await page.close();
  }
  const arabic = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'ar' });
  for (const layout of ['business', 'landing']) {
    await arabic.goto(`http://127.0.0.1:8080/?t0307_layout=${layout}&t0307_locale=ar`, { waitUntil: 'networkidle' });
    check((await arabic.locator('html').getAttribute('dir')) === 'rtl', `${name} ${layout} Arabic direction`);
    if (layout === 'landing') await arabic.screenshot({ path: `${out}/layout-landing-1280-ar.png`, fullPage: true });
    for (const width of [1280, 320]) {
      await arabic.setViewportSize({ width, height: width === 320 ? 760 : 900 });
      const bounds = await arabic.locator('main > .alignfull').evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) }; }));
      check(bounds.length >= (layout === 'landing' ? 3 : 2) && bounds.every((r) => r.left === 0 && r.right === width && r.width === width), `${name} ${layout} RTL full bleed ${width}`, JSON.stringify(bounds));
      check(await arabic.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} ${layout} RTL no overflow ${width}`);
    }
  }
  await browser.close();
}
console.log(`DONE-BROWSER ${failures}`);
if (failures) process.exitCode = 1;
