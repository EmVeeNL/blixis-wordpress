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
  const renderPage = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'en-US' });
  const renderResponse = await renderPage.goto('http://127.0.0.1:8080/?t0307_layout=business&t0307_render_settings=1', { waitUntil: 'networkidle' });
  const hasWriteMarker = await renderPage.locator('meta[name="t0307-layout-write"]').count() > 0;
  const fixtureWrite = hasWriteMarker ? await renderPage.locator('meta[name="t0307-layout-write"]').getAttribute('content') : null;
  check(Boolean(fixtureWrite), `${name} layout render fixture request`, `${renderResponse?.status()} ${renderPage.url()} ${await renderPage.locator('body').innerText().then((value) => value.slice(0, 350))}`);
  check(await renderPage.locator('.blixis-header.is-sticky.has-usp.logo-center').count() === 1, `${name} layout render configured header classes`, fixtureWrite || 'write fixture unavailable');
  check(await renderPage.locator('.blixis-usp__item').count() === 3, `${name} layout render three USP items`);
  const uspSummary = await renderPage.locator('.blixis-usp').evaluate((element) => ({ text: element.textContent.trim(), visible: element.checkVisibility(), background: getComputedStyle(element).backgroundColor }));
  check(uspSummary.visible && uspSummary.text.includes('Clear advice') && uspSummary.background !== 'rgba(0, 0, 0, 0)', `${name} layout render visible USP bar`, JSON.stringify(uspSummary));
  const headerMarkup = await renderPage.locator('header').first().innerHTML();
  check(await renderPage.locator('.blixis-header__cta').count() === 1, `${name} layout render CTA`, headerMarkup.slice(-500));
  check(await renderPage.locator('form.wp-block-search').count() === 1, `${name} layout render labelled search`);
  check(await renderPage.locator('header[role="banner"], header').count() === 1, `${name} layout render one header landmark`);
  check(await renderPage.locator('footer[role="contentinfo"], footer').count() === 1, `${name} layout render one footer landmark`);
  check(await renderPage.locator('body.blixis-footer-bottom').count() === 1, `${name} layout render footer-bottom body class`);
  const stickyStyle = await renderPage.locator('.blixis-header').count() ? await renderPage.locator('.blixis-header').evaluate((element) => getComputedStyle(element).position) : 'missing';
  check(stickyStyle === 'sticky', `${name} layout sticky header position`);
  const scrollPadding = await renderPage.locator('html').evaluate((element) => parseFloat(getComputedStyle(element).scrollPaddingTop));
  check(scrollPadding > 0, `${name} layout sticky scroll padding`, String(scrollPadding));
  await renderPage.emulateMedia({ reducedMotion: 'reduce' });
  const motion = await renderPage.locator('.blixis-header').evaluate((element) => getComputedStyle(element).animationDuration);
  check(motion === '0s', `${name} layout sticky respects reduced motion`, motion);
  await renderPage.emulateMedia({ reducedMotion: 'no-preference' });
  check(await renderPage.locator('.blixis-footer.cols-4 .blixis-footer__columns > *').count() === 4, `${name} layout render four footer columns`);
  check(await renderPage.locator('.blixis-footer__social a').count() === 3, `${name} layout render social links`);
  check(await renderPage.locator('.blixis-footer__copyright').textContent().then((value) => value.includes(new Date().getFullYear().toString())), `${name} layout render copyright year`);
  // Geometry of the rendered header and footer, for both logo positions.
  const rowGeometry = (page) => page.evaluate(() => {
    const box = (selector) => { const el = document.querySelector(selector); if (!el || !el.checkVisibility()) return null; const r = el.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, left: r.left, right: r.right, width: r.width, height: r.height }; };
    return { brand: box('.blixis-header__brand'), nav: box('.blixis-header__bar > .wp-block-navigation'), search: box('.blixis-header .wp-block-search'), cta: box('.blixis-header__cta'), bar: box('.blixis-header__bar'), vw: innerWidth };
  });
  const contrast = (page, selector) => page.locator(selector).evaluate((element) => {
    const parse = (value) => value.match(/[\d.]+/g).slice(0, 3).map(Number);
    const lum = ([r, g, b]) => { const f = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const style = getComputedStyle(element);
    const a = lum(parse(style.color)); const b = lum(parse(style.backgroundColor));
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  const centred = await rowGeometry(renderPage);
  const sameRow = (g) => [g.brand, g.nav, g.search, g.cta].every((item) => item && Math.abs(item.cy - g.brand.cy) <= 6);
  check(sameRow(centred), `${name} header items share one row at 1280 (logo centred)`, JSON.stringify(centred));
  check(Math.abs(centred.brand.cx - 640) <= 40 && centred.nav.right < centred.brand.left + 1 && centred.search.left > centred.brand.right - 1 && centred.cta.left > centred.search.right - 1, `${name} logo centred: navigation at the start, title in the middle, search and button at the end`, JSON.stringify(centred));
  check(centred.search.width < 260 && centred.search.height < 60, `${name} header search is compact`, JSON.stringify(centred.search));
  const uspBox = await renderPage.locator('.blixis-usp').evaluate((el) => { const r = el.getBoundingClientRect(); return { height: r.height, outside: !!el.closest('header, [role="banner"]'), isList: el.querySelector('ul > li') !== null, svgs: el.querySelectorAll('li svg[aria-hidden="true"]').length, items: el.querySelectorAll('li').length, rows: new Set([...el.querySelectorAll('li')].map((li) => Math.round(li.getBoundingClientRect().top))).size }; });
  check(uspBox.height > 20 && uspBox.height < 80 && !uspBox.outside && uspBox.isList && uspBox.svgs === uspBox.items && uspBox.rows === 1, `${name} USP bar is a thin list outside the banner, items on one row with decorative icons`, JSON.stringify(uspBox));
  const uspContrast = await contrast(renderPage, '.blixis-usp');
  check(uspContrast >= 4.5, `${name} USP bar text contrast ${uspContrast.toFixed(1)}:1`);
  const headerLook = await renderPage.locator('.blixis-header').evaluate((el) => { const s = getComputedStyle(el); return { background: s.backgroundColor, border: s.borderBottomWidth, shadow: s.boxShadow, z: s.zIndex }; });
  check(headerLook.background !== 'rgba(0, 0, 0, 0)' && !headerLook.background.endsWith(', 0)') && parseFloat(headerLook.border) >= 1 && headerLook.shadow !== 'none' && Number(headerLook.z) >= 10, `${name} sticky header is opaque with a border, a shadow, and a z-index`, JSON.stringify(headerLook));
  await renderPage.evaluate(() => window.scrollTo(0, 900));
  await renderPage.waitForTimeout(200);
  const midScroll = await renderPage.evaluate(() => { const header = document.querySelector('.blixis-header'); const r = header.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); const cta = header.querySelector('.blixis-header__cta').getBoundingClientRect(); const hitCta = document.elementFromPoint(cta.left + cta.width / 2, cta.top + cta.height / 2); return { top: Math.round(r.top), inside: header.contains(hit), ctaHit: hitCta?.classList.contains('blixis-header__cta'), scrolled: scrollY }; });
  check(midScroll.scrolled > 100 && midScroll.top === 0 && midScroll.inside && midScroll.ctaHit, `${name} sticky header stays at the top and is not overlapped mid-scroll`, JSON.stringify(midScroll));
  const anchor = await renderPage.evaluate(() => { document.querySelector('#contact')?.scrollIntoView(); const header = document.querySelector('.blixis-header').getBoundingClientRect(); const target = document.querySelector('#contact').getBoundingClientRect(); return { below: target.top >= header.bottom - 1, headerBottom: Math.round(header.bottom), targetTop: Math.round(target.top) }; });
  check(anchor.below, `${name} an anchor target lands below the sticky header`, JSON.stringify(anchor));
  await renderPage.evaluate(() => window.scrollTo(0, 0));
  const footer = await renderPage.locator('.blixis-footer').evaluate((el) => {
    const grid = getComputedStyle(el.querySelector('.blixis-footer__columns')).gridTemplateColumns.split(' ').length;
    const columns = [...el.querySelectorAll('.blixis-footer__columns > *')];
    const social = [...el.querySelectorAll('.blixis-footer__social a')].map((a) => ({ name: (a.textContent || '').trim(), svg: a.querySelector('svg') !== null }));
    const copy = el.querySelector('.blixis-footer__copyright').getBoundingClientRect();
    const top = el.querySelector('.blixis-footer__top').getBoundingClientRect();
    const bottomRow = el.querySelector('.blixis-footer__bottom');
    return { grid, count: columns.length, headings: columns.map((c) => c.querySelector('h2')?.textContent), menuItems: el.querySelectorAll('.blixis-footer__menu li').length, contactBr: el.querySelectorAll('.blixis-footer__contact br').length, social, sameBottomRow: Math.abs(copy.top - top.top) < 20 && copy.left < top.left, border: getComputedStyle(bottomRow).borderTopWidth, background: getComputedStyle(el).backgroundColor, navs: el.querySelectorAll('nav').length };
  });
  check(footer.grid === 4 && footer.count === 4 && footer.headings.every(Boolean), `${name} footer has four columns, each with a heading`, JSON.stringify(footer));
  check(footer.menuItems > 0 && footer.contactBr >= 1 && footer.navs === 1, `${name} footer menu is not empty and contact keeps its line breaks`, JSON.stringify(footer));
  check(footer.social.length === 3 && footer.social.every((item) => item.svg) && JSON.stringify(footer.social.map((item) => item.name)) === JSON.stringify(['LinkedIn', 'Instagram', 'YouTube']), `${name} social links have icons and the correct service names`, JSON.stringify(footer.social));
  check(footer.sameBottomRow && parseFloat(footer.border) >= 1 && footer.background !== 'rgba(0, 0, 0, 0)', `${name} footer bottom row: copyright at the start, back to top at the end, with a top border`, JSON.stringify(footer));
  // Logo at the start.
  await renderPage.goto('http://127.0.0.1:8080/?t0307_layout=business&t0307_render_settings=1&t0307_logo=start', { waitUntil: 'networkidle' });
  const start = await rowGeometry(renderPage);
  check(sameRow(start) && start.brand.left < start.nav.left && start.nav.right < start.search.left && start.search.right < start.cta.left, `${name} header items share one row at 1280 (logo at the start): title, navigation, search, button`, JSON.stringify(start));
  await blurForScreenshot(renderPage);
  await renderPage.screenshot({ path: `${out}/layout-business-render-logo-start-1280.png`, clip: { x: 0, y: 0, width: 1280, height: 260 } });
  // Footer at the bottom: short page, then a long page.
  for (const width of [1280, 320]) {
    await renderPage.setViewportSize({ width, height: width === 320 ? 1800 : 800 });
    await renderPage.goto('http://127.0.0.1:8080/?pagename=short-page&t0307_layout=business&t0307_render_settings=1', { waitUntil: 'networkidle' });
    const short = await renderPage.evaluate(() => { const r = document.querySelector('.blixis-footer').getBoundingClientRect(); return { bottom: Math.round(r.bottom), vh: innerHeight, doc: document.documentElement.scrollHeight, position: getComputedStyle(document.querySelector('.blixis-footer')).position, mainWidth: Math.round(document.querySelector('main').getBoundingClientRect().width), siteWidth: Math.round(document.querySelector('.wp-site-blocks').getBoundingClientRect().width) }; });
    check(Math.abs(short.bottom - short.vh) <= 2 && short.doc <= short.vh + 1 && short.position !== 'fixed' && short.position !== 'sticky', `${name} footer sits at the bottom of a short page at ${width}px`, JSON.stringify(short));
    check(short.mainWidth >= short.siteWidth - 2 * 16 - 2 || short.mainWidth > 280, `${name} main keeps its width with the footer at the bottom at ${width}px`, JSON.stringify(short));
    if (width === 1280) { await blurForScreenshot(renderPage); await renderPage.screenshot({ path: `${out}/layout-business-render-short-page-1280.png` }); }
    await renderPage.goto('http://127.0.0.1:8080/?t0307_layout=business&t0307_render_settings=1', { waitUntil: 'networkidle' });
    const long = await renderPage.evaluate(() => { const r = document.querySelector('.blixis-footer').getBoundingClientRect(); return { footerBottom: Math.round(r.bottom + scrollY), doc: document.documentElement.scrollHeight, vh: innerHeight }; });
    check(long.doc > long.vh * 1.5 && Math.abs(long.footerBottom - long.doc) <= 2, `${name} footer scrolls normally on a long page at ${width}px`, JSON.stringify(long));
  }
  await renderPage.setViewportSize({ width: 1280, height: 900 });
  await renderPage.goto('http://127.0.0.1:8080/?t0307_layout=business&t0307_render_settings=1', { waitUntil: 'networkidle' });
  await blurForScreenshot(renderPage);
  await renderPage.screenshot({ path: `${out}/layout-business-render-1280.png`, fullPage: true });
  await renderPage.evaluate(() => window.scrollTo(0, 700));
  await renderPage.waitForTimeout(150);
  await renderPage.screenshot({ path: `${out}/layout-business-sticky-mid-scroll.png` });
  await renderPage.setViewportSize({ width: 320, height: 760 });
  await renderPage.evaluate(() => window.scrollTo(0, 0));
  await renderPage.waitForTimeout(150);
  await renderPage.screenshot({ path: `${out}/layout-business-render-320.png`, fullPage: true });
  const small = await rowGeometry(renderPage);
  check(small.brand && small.nav && small.cta && Math.abs(small.brand.cy - small.nav.cy) <= 8 && small.search.width <= small.vw - 16 && small.search.height < 60 && small.cta.right <= small.vw, `${name} 320px header: title, menu button and button on one row, search within the row`, JSON.stringify(small));
  const usp320 = await renderPage.locator('.blixis-usp').evaluate((el) => ({ right: el.getBoundingClientRect().right, over: el.scrollWidth > el.clientWidth, height: Math.round(el.getBoundingClientRect().height) }));
  check(usp320.right <= 320 && !usp320.over, `${name} 320px USP bar wraps without overflow`, JSON.stringify(usp320));
  const opener = renderPage.locator('.wp-block-navigation__responsive-container-open').first();
  if (await opener.count()) {
    await opener.click();
    await renderPage.waitForTimeout(250);
    const overlay = await renderPage.locator('.wp-block-navigation__responsive-container.is-menu-open').count();
    check(overlay === 1, `${name} 320px overlay menu opens`);
    await renderPage.screenshot({ path: `${out}/layout-business-render-320-overlay.png` });
    await renderPage.keyboard.press('Escape');
    await renderPage.waitForTimeout(150);
  }

  check(await renderPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} configured header and footer no overflow 320`);
  check(await renderPage.locator('.blixis-footer__columns').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length) === 1, `${name} configured footer stacks at 320`);
  await renderPage.goto('http://127.0.0.1:8080/?t0307_layout=business&t0307_locale=ar&t0307_render_settings=1', { waitUntil: 'networkidle' });
  check(await renderPage.locator('html').getAttribute('dir') === 'rtl', `${name} configured layout Arabic RTL`);
  await blurForScreenshot(renderPage);
  await renderPage.screenshot({ path: `${out}/layout-business-render-1280-ar.png`, fullPage: true });
  const previewSeedUrl = 'http://127.0.0.1:8080/?t0307_layout=business&t0307_render_settings=1&t0307_preview_seed=1&t0307_preview_nonce=1';
  const nonceResponse = await editor.goto(previewSeedUrl, { waitUntil: 'networkidle' });
  const previewNonce = nonceResponse?.headers()['x-t0307-preview-nonce'] || '';
  check(Boolean(previewNonce), `${name} layout render owner preview nonce fixture`);
  const ownerPreview = await editor.goto(`http://127.0.0.1:8080/?t0307_layout=business&blixis_preview=${previewNonce}`, { waitUntil: 'networkidle' });
  check(await editor.locator('.blixis-usp__item').allTextContents().then((items) => items.some((item) => item.includes('Owner private draft'))), `${name} layout render owner sees draft`);
  check(ownerPreview?.headers()['cache-control']?.includes('no-store') && ownerPreview?.headers()['x-robots-tag']?.includes('noindex'), `${name} layout render preview no-store and noindex`);
  await renderPage.goto(`http://127.0.0.1:8080/?t0307_layout=business&blixis_preview=${previewNonce}`, { waitUntil: 'networkidle' });
  check(await renderPage.locator('.blixis-usp__item').allTextContents().then((items) => items.some((item) => item.includes('Clear advice'))), `${name} layout render anonymous sees stored config`);
  check(await renderPage.locator('.blixis-usp__item').allTextContents().then((items) => items.every((item) => !item.includes('Owner private draft'))), `${name} layout render anonymous cannot see draft`);
  const editorUser = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await editorUser.goto('http://127.0.0.1:8080/wp-login.php', { waitUntil: 'networkidle' });
  await editorUser.locator('#user_login').fill('fixture_editor');
  await editorUser.locator('#user_pass').fill(process.env.T0307_ADMIN_PASSWORD);
  await editorUser.locator('#wp-submit').click();
  await editorUser.goto(`http://127.0.0.1:8080/?t0307_layout=business&blixis_preview=${previewNonce}`, { waitUntil: 'networkidle' });
  check(await editorUser.locator('.blixis-usp__item').allTextContents().then((items) => items.some((item) => item.includes('Clear advice'))), `${name} layout render editor sees stored config`);
  check(await editorUser.locator('.blixis-usp__item').allTextContents().then((items) => items.every((item) => !item.includes('Owner private draft'))), `${name} layout render editor cannot see another draft`);
  await editorUser.close();
  await renderPage.goto('http://127.0.0.1:8080/?t0307_base=1&t0307_no_layout=1', { waitUntil: 'networkidle' });
  check(await renderPage.locator('.blixis-header').count() === 0 && await renderPage.locator('.blixis-footer').count() === 0, `${name} unconfigured Base keeps plain parts`);
  await blurForScreenshot(renderPage);
  await renderPage.screenshot({ path: `${out}/base-unconfigured-1280.png`, fullPage: true });
  await renderPage.close();
  await browser.close();
}
console.log(`DONE-BROWSER ${failures}`);
if (failures) process.exitCode = 1;
