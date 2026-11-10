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
const blurForScreenshot = async (page) => page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
for (const name of browsers) {
  const type = name === 'firefox' ? firefox : chromium;
  const browser = await type.launch({ headless: true });
  const editor = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await editor.goto('http://127.0.0.1:8080/wp-login.php', { waitUntil: 'networkidle' });
  await editor.locator('#user_login').fill('fixture_admin');
  await editor.locator('#user_pass').fill(process.env.T0307_ADMIN_PASSWORD);
  await editor.locator('#wp-submit').click();
  await editor.goto('http://127.0.0.1:8080/wp-admin/post-new.php', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await editor.waitForFunction(() => window.wp?.blocks?.parse);
  for (const layout of layouts) {
    if (layout !== 'blank') {
      const validity = await editor.evaluate(async (layout) => {
        const response = await fetch(`/?rest_route=%2Ft0307%2Fv1%2Fpattern%2F${layout}`);
        if (!response.ok) throw new Error(`rendered pattern endpoint returned ${response.status}`);
        const responseText = await response.text();
        let rendered;
        try { rendered = JSON.parse(responseText); } catch { throw new Error(`rendered pattern endpoint returned non-JSON: ${response.status} ${responseText.slice(0, 120)}`); }
        const content = `${rendered.template}\n${rendered.content}`;
        const blocks = wp.blocks.parse(content);
        return blocks.flatMap(function flatten(block) { return [block, ...(block.innerBlocks || []).flatMap(flatten)]; }).filter((block) => !block.isValid || block.validationIssues?.length).map((block) => block.name);
      }, layout);
      check(validity.length === 0, `${name} ${layout} block validity`, JSON.stringify(validity));
    }
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
      const ctaHeading = page.locator('main > .alignfull h2').filter({ hasText: 'Ready to start?' });
      check(await ctaHeading.count() === 1 && await ctaHeading.isVisible(), `${name} business CTA heading visible`);
      const ctaPadding = await ctaHeading.locator('..').evaluate((el) => { const style = getComputedStyle(el); return [style.paddingTop, style.paddingBottom]; });
      check(ctaPadding[0] === ctaPadding[1], `${name} business CTA even vertical padding`, ctaPadding.join('/'));
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
      const ctaColors = await page.locator('main > .alignfull .wp-block-button__link').first().evaluate((el) => ({ button: getComputedStyle(el).backgroundColor, band: getComputedStyle(el.closest('.alignfull')).backgroundColor, text: getComputedStyle(el).color }));
      check(ctaColors.button !== ctaColors.band, `${name} landing hero CTA has button background`, JSON.stringify(ctaColors));
      check(ctaColors.button !== 'rgba(0, 0, 0, 0)' && ctaColors.text !== ctaColors.button, `${name} landing hero CTA contrast colors`, JSON.stringify(ctaColors));
    }
    if (layout === 'blog') {
      check(await page.getByText('No posts yet. Check back soon for the latest stories.').count() === 1, `${name} blog no-results message`);
      await blurForScreenshot(page);
      await page.screenshot({ path: `${out}/layout-blog-empty-1280.png`, fullPage: true });
      await page.goto('http://127.0.0.1:8080/?t0307_layout=blog&t0307_posts=1', { waitUntil: 'networkidle' });
      const queries = page.locator('main .wp-block-query');
      const featuredCount = await queries.nth(0).locator('.wp-block-post-title').count();
      const grid = queries.nth(1);
      check(featuredCount === 1, `${name} blog featured card with posts`, `titles=${featuredCount}`);
      const cardCounts = await Promise.all([grid.locator('.wp-block-post-title').count(), grid.locator('time').count(), grid.locator('.wp-block-post-excerpt').count()]);
      check(cardCounts.every((count) => count === 1), `${name} blog secondary post card title/date/excerpt`, cardCounts.join('/'));
      await blurForScreenshot(page);
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
    if (layout !== 'blog') { await blurForScreenshot(page); await page.screenshot({ path: `${out}/layout-${layout}-1280.png`, fullPage: true }); }
    await page.setViewportSize({ width: 320, height: 760 });
    await page.waitForTimeout(100);
    if (layout === 'landing') {
      const sectionInsets = await page.locator('main section').evaluateAll((sections) => sections.map((section) => {
        const heading = section.querySelector('h1,h2,h3');
        return { id: section.id, left: heading ? heading.getBoundingClientRect().left : null, top: parseFloat(getComputedStyle(section).paddingTop), bottom: parseFloat(getComputedStyle(section).paddingBottom) };
      }));
      const navigationInset = await page.locator('nav[aria-label="On this page"] a').first().evaluate((link) => link.getBoundingClientRect().left);
      const insetValues = [...sectionInsets.map((section) => section.left), navigationInset];
      check(insetValues.every((left) => left !== null && Math.abs(left - insetValues[0]) <= 2), `${name} landing section and navigation left inset equal at 320`, JSON.stringify(insetValues));
      check(sectionInsets.every((section) => section.top === sectionInsets[0].top && section.bottom === sectionInsets[0].bottom), `${name} landing sections equal vertical padding`, JSON.stringify(sectionInsets));
    }
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} ${layout} no overflow 320`);
    const edgeViolations = await page.locator('main').evaluate((main) => Array.from(main.querySelectorAll('h1,h2,h3,h4,h5,h6,p,a,button,summary,li,blockquote,figcaption,label')).filter((el) => el.textContent?.trim() && el.checkVisibility()).map((el) => ({ tag: el.tagName.toLowerCase(), text: el.textContent.trim().slice(0, 40), left: Math.round(el.getBoundingClientRect().left), right: Math.round(el.getBoundingClientRect().right) })).filter((r) => r.left < 8 || r.right > innerWidth - 8));
    check(edgeViolations.length === 0, `${name} ${layout} text blocks inset 8px at 320`, JSON.stringify(edgeViolations));
    if (bandSelectors[layout]) {
      for (const selector of bandSelectors[layout]) {
        const bounds = await page.locator(selector).evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) }; }));
        check(bounds.every((r) => r.left === 0 && r.right === 320 && r.width === 320), `${name} ${layout} full bleed 320`, JSON.stringify(bounds));
      }
    }
    violations = await page.evaluate(async () => (await axe.run(document)).violations.map((v) => `${v.id}:${v.nodes.map((n) => n.target.join(' ')).join('|')}`));
    check(violations.length === 0, `${name} ${layout} axe 320`, violations.join(','));
    await blurForScreenshot(page);
    await page.screenshot({ path: `${out}/layout-${layout}-320.png`, fullPage: true });
    check(external.length === 0, `${name} ${layout} no external requests`, external.join(','));
    await page.close();
  }
  const arabic = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'ar' });
  for (const layout of ['business', 'landing']) {
    await arabic.goto(`http://127.0.0.1:8080/?t0307_layout=${layout}&t0307_locale=ar`, { waitUntil: 'networkidle' });
    check((await arabic.locator('html').getAttribute('dir')) === 'rtl', `${name} ${layout} Arabic direction`);
    if (layout === 'landing') { await blurForScreenshot(arabic); await arabic.screenshot({ path: `${out}/layout-landing-1280-ar.png`, fullPage: true }); }
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
