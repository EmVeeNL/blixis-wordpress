import { chromium, firefox } from 'playwright';
import { readFile } from 'node:fs/promises';
const browsers = (process.env.T0307_BROWSERS || 'chromium').split(',');
const axe = await readFile('/work/vendor/axe.min.js', 'utf8');
let failures = 0;
const check = (ok, label, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? `: ${detail}` : ''}`); if (!ok) failures++; };
for (const name of browsers) {
  const type = name === 'firefox' ? firefox : chromium;
  const browser = await type.launch({ headless: true });
  for (const [index, layout] of (process.env.T0307_LAYOUTS || 'blank,business,portfolio,blog,landing').split(',').entries()) {
    const locale = ['en_US', 'nl_NL', 'ar'][index % 3];
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: locale === 'ar' ? 'ar' : locale === 'nl_NL' ? 'nl-NL' : 'en-US' });
    const external = [];
    page.on('request', (request) => { if (!request.url().startsWith('http://127.0.0.1:8080') && !request.url().startsWith('data:') && !request.url().startsWith('blob:http://127.0.0.1:8080/')) external.push(request.url()); });
    await page.goto(`http://127.0.0.1:8080/?t0307_layout=${layout}&t0307_locale=${locale === 'en_US' ? '' : locale}`, { waitUntil: 'networkidle' });
    const language = await page.locator('html').getAttribute('lang');
    check(locale === 'en_US' || language?.toLowerCase().startsWith(locale === 'nl_NL' ? 'nl' : 'ar'), `${name} ${layout} ${locale} document language`, language || 'missing');
    if (locale === 'ar') check(await page.locator('html').getAttribute('dir') === 'rtl', `${name} ${layout} Arabic direction`);
    check(await page.locator('main').count() === 1, `${name} ${layout} one main`);
    check(await page.locator('main h1').count() === 1, `${name} ${layout} one h1`);
    check(await page.locator('a.skip-link, .skip-link').count() > 0, `${name} ${layout} skip link`);
    check((await page.locator('nav').evaluateAll((els) => els.every((el) => el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby')))), `${name} ${layout} labelled navigation`);
    if (layout === 'business') check(await page.locator('#contact').count() === 1 && await page.locator('a[href=\"#contact\"]').count() === 1, `${name} business contact CTA target`);
    if (layout === 'portfolio') check(await page.locator('#projects').count() === 1, `${name} portfolio project section`, await page.locator('body').getAttribute('class') || 'no body class');
    if (layout === 'landing') check(await page.locator('#introduction, #details').count() === 2, `${name} landing anchors`, await page.locator('body').getAttribute('class') || 'no body class');
    if (layout === 'blog') check(await page.locator('.wp-block-query').count() > 0, `${name} blog query loop`);
    await page.addScriptTag({ content: axe });
    let axeResults = await page.evaluate(async () => (await axe.run(document)).violations.map((v) => `${v.id}:${v.nodes.map((n) => n.target.join(' ')).join('|')}`));
    check(axeResults.length === 0, `${name} ${layout} axe 1280`, axeResults.join(','));
    await page.setViewportSize({ width: 320, height: 760 });
    await page.waitForTimeout(100);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    check(!overflow, `${name} ${layout} no overflow 320`);
    axeResults = await page.evaluate(async () => (await axe.run(document)).violations.map((v) => `${v.id}:${v.nodes.map((n) => n.target.join(' ')).join('|')}`));
    check(axeResults.length === 0, `${name} ${layout} axe 320`, axeResults.join(','));
    check(external.length === 0, `${name} ${layout} no external requests`, external.join(','));
    await page.close();
  }
  await browser.close();
}
console.log(`DONE-BROWSER ${failures}`);
if (failures) process.exitCode = 1;
