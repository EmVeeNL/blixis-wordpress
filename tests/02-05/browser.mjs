// Task 02-05 browser stage. Drives real browsers against the throwaway WordPress site with the
// showcase child theme active. Prints PASS/FAIL/NOTE lines, writes screenshots to shots/, and ends
// with DONE-BROWSER. Exit 0 only when nothing failed.
import { chromium, firefox } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:8080';
const AXE = readFileSync('vendor/axe.min.js', 'utf8');
const WIDTHS = [320, 768, 1280];
const SECRETS = ['T0205-DRAFT-BODY', 'T0205 Draft Secret'];
const CLAIMS = /\b(drag[- ]and[- ]drop|page builder|setup wizard|visual (?:editor|builder)|live (?:token|style) editor|element registry|one-click (?:install|setup)|AI[- ](?:generated|powered)|cloud sync|WCAG (?:2\.\d )?(?:AA )?(?:compliant|conformant|certified)|fully accessible)\b/i;
const HEDGE = /\b(planned|future|later|not (?:yet|implemented|available)|roadmap|coming)\b/i;
const PLACEHOLDER = /lorem ipsum|\bTODO\b|\bFIXME\b|\bundefined\b|\bNaN\b|\[object |Hello world!|Sample Page/i;
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

let fails = 0;
let current = '';
const report = { checks: [], axe: {}, contrast: {} };
const check = (name, ok, detail = '') => {
  if (!ok) fails++;
  const line = `${ok ? 'PASS' : 'FAIL'} [${current}] ${name}${!ok && detail ? ' -- ' + String(detail).slice(0, 600).replace(/\n/g, ' | ') : ''}`;
  report.checks.push(line);
  console.log(line);
};
const note = (name, value) => console.log(`NOTE [${current}] ${name}: ${String(value).slice(0, 400)}`);
mkdirSync('shots', { recursive: true });

async function go(page, url) {
  for (let attempt = 0; ; attempt++) {
    try { return await page.goto(url, { waitUntil: 'load' }); } catch (e) {
      if (attempt > 0 || !/ERR_ABORTED/.test(e.message)) throw e;
      await page.waitForTimeout(300);
    }
  }
}

// ---- In-page helpers.
const structureFn = () => {
  const q = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const label = (el) => q(el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') ? document.getElementById(el.getAttribute('aria-labelledby'))?.textContent : ''));
  const scoped = (selector) => [...document.querySelectorAll(selector)].filter((el) => !el.closest('article, aside, main, nav, section'));
  const main = document.querySelector('main');
  const h1s = [...document.querySelectorAll('h1')];
  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(vis).map((h) => Number(h.tagName[1]));
  const skips = [...document.querySelectorAll('a.skip-link')];
  const target = skips[0] ? document.getElementById(decodeURIComponent((skips[0].getAttribute('href') || '').slice(1))) : null;
  const navs = [...document.querySelectorAll('nav, [role=navigation]')];
  const imgs = [...document.querySelectorAll('img')].map((i) => {
    const r = i.getBoundingClientRect();
    const cs = getComputedStyle(i);
    const ratioN = i.naturalWidth / (i.naturalHeight || 1);
    const ratioR = r.width / (r.height || 1);
    return { src: (i.currentSrc || i.src).slice(-60), loaded: i.complete && i.naturalWidth > 0, alt: i.getAttribute('alt'), distorted: r.width > 0 && cs.objectFit === 'fill' && Math.abs(ratioN - ratioR) / ratioN > 0.02 };
  });
  return {
    mains: document.querySelectorAll('main, [role=main]').length,
    banners: scoped('body header, body [role=banner]').length,
    contentinfos: scoped('body footer, body [role=contentinfo]').length,
    h1: h1s.map((h) => q(h.textContent)),
    h1InMain: h1s.every((h) => main?.contains(h)),
    h1Visible: h1s.every(vis),
    headings,
    navs: navs.map((n) => ({ label: label(n), links: n.querySelectorAll('a').length })),
    skipCount: skips.length,
    skipTargetOk: Boolean(target && (target === main || main?.contains(target))),
    lang: document.documentElement.lang,
    title: q(document.title),
    viewport: document.querySelector('meta[name=viewport]')?.content ?? '',
    imgs,
    mainText: q(main?.innerText),
    html: document.documentElement.outerHTML,
    animations: document.getAnimations().filter((a) => a.playState === 'running').length,
    emptyLinks: [...document.querySelectorAll('a[href]')].filter((a) => !q(a.textContent) && !a.getAttribute('aria-label') && !a.querySelector('img[alt]:not([alt=""])')).length,
    navLinks: [...new Set([...document.querySelectorAll('header a[href], nav a[href]')].map((a) => a.href).filter((h) => h.startsWith(location.origin) && !h.includes('#') && !h.includes('/wp-')))].slice(0, 10),
  };
};

const overflowFn = () => {
  const doc = document.documentElement;
  const width = doc.clientWidth;
  const offenders = [];
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > width + 1 || r.left < -1) {
      let clipped = false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (['auto', 'scroll', 'hidden', 'clip'].includes(o)) { clipped = true; break; } }
      if (!clipped) offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/).slice(0, 2).join('.')} l=${Math.round(r.left)} r=${Math.round(r.right)}`);
    }
  }
  if (!offenders.length && doc.scrollWidth > width) offenders.push(`document scrollWidth ${doc.scrollWidth}`);
  return { scrollWidth: doc.scrollWidth, clientWidth: width, offenders: offenders.slice(0, 5) };
};

// WCAG 1.4.3 / 1.4.11 on rendered colours. Backgrounds are composited up the tree; elements over
// images or gradients are skipped and reported, not guessed.
const contrastFn = () => {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/) || c.match(/color\(srgb ([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); if (c.startsWith('color(')) return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p[3] ?? 1 }; return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const over = (top, bottom) => { const a = top.a + bottom.a * (1 - top.a); return a === 0 ? { r: 255, g: 255, b: 255, a: 0 } : { r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / a, g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / a, b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / a, a }; };
  const ratio = (x, y) => { const [hi, lo] = [lum(x), lum(y)].sort((m, n) => n - m); return (hi + 0.05) / (lo + 0.05); };
  const bgOf = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage !== 'none') return { skip: `background-image on ${e.tagName.toLowerCase()}` };
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a === 1) break; }
    }
    let acc = { r: 255, g: 255, b: 255, a: 1 };
    for (const l of layers.reverse()) acc = over(l, acc);
    return { color: acc };
  };
  const out = { low: [], skipped: new Set(), checked: 0, min: 99 };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || seen.has(el) || !n.textContent.trim() || el.closest('script,style,noscript,template')) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (el.closest('a.skip-link') && r.right <= 1) continue; // off-screen until focused; checked on focus
    const bg = bgOf(el);
    if (bg.skip) { out.skipped.add(bg.skip); continue; }
    const fg = parse(cs.color);
    if (!fg) continue;
    const text = over(fg, bg.color);
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
    const cr = ratio(text, bg.color);
    out.checked++;
    out.min = Math.min(out.min, cr);
    if (cr < (large ? 3 : 4.5)) out.low.push(`${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/)[0]} ${cr.toFixed(2)}:1 "${n.textContent.trim().slice(0, 24)}"`);
  }
  out.skipped = [...out.skipped];
  out.low = out.low.slice(0, 6);
  return out;
};

// Left-edge and row-position regression checks for the showcase front page.
const layoutFn = (spec) => {
  const box = (selector) => { const el = document.querySelector(selector); if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width }; };
  const edges = Object.fromEntries(Object.entries(spec.edges).map(([name, selector]) => [name, box(selector)?.left ?? null]));
  const band = box(spec.band);
  const items = [...document.querySelectorAll(spec.items)].map((el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left }; });
  return { edges, band, items, viewport: document.documentElement.clientWidth };
};
const LAYOUT_SPEC = {
  edges: { header: '.showcase-header-inner .showcase-wordmark', eyebrow: '.blixis-showcase-hero .showcase-eyebrow', h1: '.blixis-showcase-hero h1', feature: '.blixis-showcase-features-list .showcase-feature-icon', statusHeading: '.blixis-showcase-status > h2', card: '.blixis-showcase-card', footer: '.showcase-footer-inner .showcase-wordmark' },
  band: '.blixis-showcase-status',
  items: '.blixis-showcase-features-list li',
};
// Returns a list of problems; empty means the page passes.
const layoutProblems = (m) => {
  const problems = [];
  const names = Object.keys(m.edges);
  const missing = names.filter((n) => m.edges[n] === null);
  if (missing.length) problems.push(`missing: ${missing.join(',')}`);
  else {
    const lefts = names.map((n) => m.edges[n]);
    if (Math.max(...lefts) - Math.min(...lefts) > 1) problems.push(`left edges differ: ${names.map((n) => `${n}=${m.edges[n].toFixed(1)}`).join(' ')}`);
  }
  if (!m.band || Math.abs(m.band.left) > 1 || Math.abs(m.band.width - m.viewport) > 1) problems.push(`status band not full width: ${JSON.stringify(m.band)} of ${m.viewport}`);
  // Items sharing a row (same left-to-right band of tops) must share a top; stacked items must be evenly spaced.
  const rows = [];
  for (const item of m.items) { const row = rows.find((r) => Math.abs(r[0].top - item.top) < 40 && item.left > r[r.length - 1].left); if (row) row.push(item); else rows.push([item]); }
  for (const row of rows) if (Math.max(...row.map((i) => i.top)) - Math.min(...row.map((i) => i.top)) > 1) problems.push(`feature row tops differ: ${row.map((i) => i.top.toFixed(1)).join(',')}`);
  if (rows.length < 1 || m.items.length !== 4) problems.push(`expected 4 feature items, found ${m.items.length}`);
  return problems;
};

const focusFn = () => {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const cx = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1);
  const cy = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
  const top = document.elementFromPoint(cx, cy);
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  let bg = { r: 255, g: 255, b: 255 };
  for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a === 1) { bg = c; break; } }
  const oc = parse(cs.outlineColor);
  const ring = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 1 && oc;
  const [hi, lo] = ring ? [lum(oc), lum(bg)].sort((a, b) => b - a) : [0, 0];
  return {
    tag: el.tagName.toLowerCase(),
    text: (el.textContent || el.getAttribute('aria-label') || el.getAttribute('name') || '').replace(/\s+/g, ' ').trim().slice(0, 40),
    region: el.matches('a.skip-link') ? 'skip' : el.closest('main') ? 'main' : el.closest('footer') ? 'footer' : el.closest('header') ? 'header' : 'other',
    onScreen: r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight,
    covered: !(top === el || el.contains(top) || top?.contains(el)),
    ringRatio: ring ? (hi + 0.05) / (lo + 0.05) : 0,
    shadow: cs.boxShadow !== 'none',
    inline: cs.display === 'inline',
    w: r.width, h: r.height,
  };
};

async function runAxe(page, label, tags = AXE_TAGS) {
  await page.addScriptTag({ content: AXE });
  const result = await page.evaluate(async (tags) => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: tags } });
    const pick = (list) => list.map((v) => ({ id: v.id, count: v.nodes.length, first: `${v.nodes[0]?.target.join(' ')} :: ${(v.nodes[0]?.failureSummary || '').replace(/\s+/g, ' ').slice(0, 140)}` }));
    return { violations: pick(r.violations), incomplete: pick(r.incomplete) };
  }, tags);
  report.axe[`${current} ${label}`] = result;
  return result;
}

async function keyboardChecks(page, url) {
  await go(page, BASE + url);
  await page.evaluate(() => { scrollTo(0, 0); document.activeElement?.blur?.(); });
  const stops = [];
  let left = false;
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press('Tab');
    const s = await page.evaluate(focusFn);
    if (!s) { left = true; break; }
    const prev = stops.at(-1);
    if (prev && prev.text === s.text && prev.tag === s.tag && prev.w === s.w) { left = true; break; }
    stops.push(s);
  }
  check('keyboard: first Tab stop is the skip link', stops[0]?.region === 'skip', JSON.stringify(stops[0]));
  const rank = { skip: 0, header: 1, main: 2, footer: 3, other: 2 };
  const ranks = stops.filter((x) => x.region !== 'other').map((x) => rank[x.region]);
  check('keyboard: order is header, main, footer', ranks.every((r, i) => !i || r >= ranks[i - 1]), stops.map((x) => x.region).join('>'));
  check('keyboard: no trap; end of page reachable', left && stops.length < 80, `${stops.length} stops`);
  check('keyboard: every stop is on screen (WCAG 2.4.7)', stops.every((x) => x.onScreen), JSON.stringify(stops.filter((x) => !x.onScreen).map((x) => x.text)));
  check('keyboard: no focus stop is covered by other content (WCAG 2.4.11)', stops.every((x) => !x.covered), JSON.stringify(stops.filter((x) => x.covered).map((x) => x.text)));
  check('keyboard: each stop has a focus indicator (outline >= 3:1, or a shadow)', stops.every((x) => x.ringRatio >= 3 || x.shadow), JSON.stringify(stops.filter((x) => !(x.ringRatio >= 3 || x.shadow)).map((x) => [x.text, x.ringRatio.toFixed(2)])));
  check('keyboard: non-inline targets are at least 24x24 CSS px (WCAG 2.5.8)', stops.every((x) => x.inline || (x.w >= 24 && x.h >= 24)), JSON.stringify(stops.filter((x) => !x.inline && (x.w < 24 || x.h < 24)).map((x) => [x.text, Math.round(x.w), Math.round(x.h)])));
  // Skip link activation lands in main.
  await go(page, BASE + url);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  const after = await page.evaluate(() => ({ hash: location.hash, inMain: Boolean(document.querySelector('main')?.contains(document.activeElement)) || document.activeElement === document.querySelector('main') }));
  await page.keyboard.press('Tab');
  const next = await page.evaluate(() => Boolean(document.activeElement?.closest('header')));
  check('keyboard: skip link moves past the header', after.hash.length > 1 && !next, JSON.stringify(after));
  note('tab stops', stops.map((x) => `${x.region}:${x.text}`).join(' > '));
}

async function textSpacing(page) {
  await page.addStyleTag({ content: '*{line-height:1.5 !important;letter-spacing:.12em !important;word-spacing:.16em !important}p{margin-bottom:2em !important}' });
  const o = await page.evaluate(overflowFn);
  check('WCAG 1.4.12 text spacing at 320px causes no horizontal overflow', o.scrollWidth <= o.clientWidth, o.offenders.join('; '));
}

async function runRoute(page, route, ctx) {
  current = `${ctx.browser}:${route.id}`;
  const failures = [], external = [], bad = [];
  const onConsole = (m) => { if (m.type() === 'error' && !/favicon/.test(m.text()) && !/Failed to load resource.*(404|403)/.test(m.text())) failures.push(m.text()); };
  const onError = (e) => failures.push(String(e));
  const onRequest = (r) => { if (!/^(data|blob):/.test(r.url()) && !r.url().startsWith(BASE)) external.push(r.url()); };
  const onResponse = (r) => { if (r.status() >= 400 && r.request().resourceType() !== 'document' && !/favicon/.test(r.url())) bad.push(`${r.status()} ${r.url()}`); };
  page.on('console', onConsole); page.on('pageerror', onError); page.on('request', onRequest); page.on('response', onResponse);

  await page.setViewportSize({ width: 1280, height: 900 });
  const response = await go(page, BASE + route.url);
  const s = await page.evaluate(structureFn);
  check(`status ${route.status}`, response?.status() === route.status, response?.status());
  check('exactly one main landmark', s.mains === 1, s.mains);
  check('one banner and one contentinfo outside sectioning content', s.banners === 1 && s.contentinfos === 1, `${s.banners}/${s.contentinfos}`);
  check('exactly one visible h1 inside main (the front page included)', s.h1.length === 1 && s.h1[0].length > 0 && s.h1Visible && s.h1InMain, JSON.stringify(s.h1));
  check('heading levels never skip downward', s.headings.every((l, i) => i === 0 || l <= s.headings[i - 1] + 1), s.headings.join(','));
  check('navigation landmarks are labelled uniquely and contain links', s.navs.length >= 1 && s.navs.every((n) => n.label && n.links) && new Set(s.navs.map((n) => n.label)).size === s.navs.length, JSON.stringify(s.navs));
  check('one skip link whose target is main or inside it', s.skipCount === 1 && s.skipTargetOk);
  check('lang, title and a scalable viewport', Boolean(s.lang) && s.title.length > 0 && /width=device-width/.test(s.viewport) && !/user-scalable=(no|0)|maximum-scale=1(\.0)?\b/.test(s.viewport), `${s.lang}|${s.title}|${s.viewport}`);
  check('no link without an accessible name', s.emptyLinks === 0, s.emptyLinks);
  check('every image loaded, has an alt attribute, and keeps its aspect ratio', s.imgs.every((i) => i.loaded && i.alt !== null && !i.distorted), JSON.stringify(s.imgs.filter((i) => !i.loaded || i.alt === null || i.distorted)));
  if (route.marker) check(`content rendered (${route.marker})`, s.mainText.includes(route.marker), s.mainText.slice(0, 160));
  check('no placeholder, debug, or lorem text', !PLACEHOLDER.test(s.mainText) || route.allowSample, (s.mainText.match(PLACEHOLDER) ?? [''])[0]);
  const claims = s.mainText.split(/(?<=[.!?])\s+/).filter((t) => CLAIMS.test(t) && !HEDGE.test(t));
  check('no claim of an unimplemented capability in visible copy', claims.length === 0, claims.join(' | '));
  const leaks = SECRETS.filter((x) => s.html.includes(x));
  check('no draft content in the HTML', leaks.length === 0, leaks.join(','));
  check('reduced motion: no running animations', s.animations === 0, s.animations);
  if (route.kind === 'front' && ctx.firstFront) ctx.discovered.push(...s.navLinks);

  if (route.kind === 'front' && ctx.browser === 'chromium') {
    await page.setViewportSize({ width: 1200, height: 900 });
    await go(page, BASE + route.url);
    await page.screenshot({ path: 'shots/theme-screenshot-1200x900.png' });
    // Neutral Base theme alone, on a disposable site, for its own admin thumbnail.
    await go(page, BASE + '/?page_id=6005&t0205_theme=blixis-base');
    const base = await page.evaluate(() => ({ html: document.documentElement.outerHTML, h1: document.querySelector('h1')?.textContent ?? '', external: performance.getEntriesByType('resource').filter((e) => !e.name.startsWith(location.origin)).length }));
    check('Base-alone capture renders the Base theme only (no showcase stylesheet) with its sample page', base.html.includes('/themes/blixis-base/') && !/blixis-showcase/i.test(base.html) && base.h1.includes('Neutral Base theme') && base.external === 0, base.h1);
    await page.screenshot({ path: 'shots/base-screenshot-1200x900.png' });
    for (const width of [1280, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await go(page, BASE + '/?page_id=6005&t0205_theme=blixis-base');
      await page.screenshot({ path: `shots/base-unconfigured-${width}.png`, fullPage: true });
    }

    // Exercise the same CSS properties that the token stylesheet emits, for a visual proof that
    // the optional Showcase follows configured values while retaining its no-config fallback.
    await page.setViewportSize({ width: 1280, height: 900 });
    await go(page, BASE + route.url);
    const tokenStyle = await page.addStyleTag({ content: ':root{--blixis-color-primary:#b42318;--blixis-color-accent:#7f1d1d;--blixis-color-foreground:#101828;--blixis-color-surface:#fff;--blixis-color-muted:#475569;--blixis-font-body:Georgia,serif;--blixis-font-heading:Georgia,serif;--blixis-spacing-md:2rem;--blixis-spacing-sm:1.25rem;--blixis-spacing-lg:2rem;--blixis-layout-gutter:2rem;--blixis-layout-wide-width:80rem}' });
    await page.screenshot({ path: 'shots/showcase-tokens-1280.png', fullPage: true });
    await tokenStyle.evaluate((element) => element.remove());
  }

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await go(page, BASE + route.url);
    const o = await page.evaluate(overflowFn);
    check(`no horizontal overflow at ${width}px`, o.scrollWidth <= o.clientWidth, `${o.scrollWidth} > ${o.clientWidth}; ${o.offenders.join('; ')}`);
    const c = await page.evaluate(contrastFn);
    report.contrast[`${current} ${width}`] = c;
    check(`rendered text contrast meets WCAG 2.2 AA at ${width}px (${c.checked} text elements, min ${c.min === 99 ? 'n/a' : c.min.toFixed(2)}:1)`, c.low.length === 0 && c.checked > 0, c.low.join('; ') || 'no text checked');
    if (c.skipped.length) note(`contrast skipped (needs visual review) at ${width}px`, c.skipped.join(', '));
    const a = await runAxe(page, String(width));
    check(`axe-core 4.14.0 finds no WCAG 2.2 AA or best-practice violations at ${width}px`, a.violations.length === 0, a.violations.map((v) => `${v.id}(${v.count}) ${v.first}`).join(' || '));
    if (a.incomplete.length) note(`axe needs review at ${width}px`, a.incomplete.map((v) => v.id).join(','));
    await go(page, BASE + route.url);
    const shot = await page.screenshot({ path: `shots/${ctx.browser}-${route.id}-${width}.png`, fullPage: true });
    check(`screenshot at ${width}px is not blank`, shot.length > 4000, `${shot.length} bytes`);
    if (width === 320) { await textSpacing(page); }
  }

  if (route.kind === 'front') {
    for (const width of [1440, 1280, 820, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await go(page, BASE + route.url);
      const problems = layoutProblems(await page.evaluate(layoutFn, LAYOUT_SPEC));
      check(`layout at ${width}px: header, hero, features, cards and footer share one left edge; status band is full width; feature rows align`, problems.length === 0, problems.join('; '));
    }
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  if (route.keyboard) await keyboardChecks(page, route.url);
  check('no console errors or uncaught exceptions', failures.length === 0, failures.join(' | '));
  check('no third-party requests', external.length === 0, external.join(', '));
  check('no failed sub-resource requests', bad.length === 0, bad.join(', '));
  page.off('console', onConsole); page.off('pageerror', onError); page.off('request', onRequest); page.off('response', onResponse);
}

const ROUTES = [
  { id: 'front', url: '/', kind: 'front', status: 200, keyboard: true, marker: 'A strong foundation for every website.' },
  { id: 'about', url: '/?page_id=6002', status: 200, marker: 'T0205-ABOUT-BODY', keyboard: true },
  { id: 'contact', url: '/?page_id=6003', status: 200, marker: 'T0205-CONTACT-BODY' },
  { id: 'post', url: '/?p=6101', status: 200, marker: 'T0205-POST-BODY' },
  { id: 'search', url: '/?s=Showcase', status: 200 },
  { id: '404', url: '/?p=999999', status: 404 },
  { id: 'draft', url: '/?page_id=6004', status: 404 },
];

const engines = { chromium, firefox };
const wanted = (process.env.T0205_BROWSERS || 'chromium').split(',').filter(Boolean);
let ran = 0;
for (const name of wanted) {
  if (!engines[name]) { console.log(`HARNESS unknown browser ${name}`); continue; }
  const browser = await engines[name].launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const ctx = { browser: name, discovered: [], firstFront: true };
  const guarded = async (route) => {
    try { await runRoute(page, route, ctx); } catch (e) { current = `${name}:${route.id}`; check('route test completed without a browser error', false, e.message.split('\n')[0]); }
  };
  for (const r of ROUTES) { await guarded(r); if (r.kind === 'front') ctx.firstFront = false; }
  // Inner pages reachable from the header navigation are real pages: each renders semantically.
  const known = new Set(ROUTES.map((r) => r.url));
  const inner = [...new Set(ctx.discovered.map((h) => h.slice(BASE.length) || '/'))].filter((u) => u !== '/' && !known.has(u)).slice(0, 6);
  note('inner pages found through navigation', inner.join(', ') || 'none');
  for (const [i, url] of inner.entries()) await guarded({ id: `nav-${i + 1}`, url, status: 200, allowSample: false });
  // Whole-site checks once per engine.
  current = `${name}:site`;
  const sitemapOk = (await context.request.get(BASE + '/?feed=rss2')).ok();
  check('RSS feed answers and exposes no draft', sitemapOk && !(await (await context.request.get(BASE + '/?feed=rss2')).text()).includes('T0205-DRAFT-BODY'));
  await browser.close();
  ran++;
}
// Control: the audits must be able to fail. A deliberately low-contrast page has to be reported.
{
  const browser = await chromium.launch();
  const page = await browser.newPage();
  current = 'control';
  await page.setContent('<!doctype html><html lang="en"><head><title>t</title></head><body><main><p style="color:#bbb;background:#fff">faint grey text</p><img src="x.png"></main></body></html>');
  const c = await page.evaluate(contrastFn);
  check('control: contrast audit reports #bbb on white (the check can fail)', c.low.length === 1, JSON.stringify(c));
  const a = await runAxe(page, 'control');
  check('control: axe reports violations on a broken page', a.violations.some((v) => v.id === 'image-alt'), a.violations.map((v) => v.id).join(','));
  await page.setViewportSize({ width: 320, height: 600 });
  await page.setContent('<!doctype html><html lang="en"><body><div style="width:600px">wide</div></body></html>');
  const o = await page.evaluate(overflowFn);
  check('control: overflow audit reports a 600px box at 320px', o.scrollWidth > o.clientWidth, JSON.stringify(o));
  await page.setViewportSize({ width: 1440, height: 900 });
  const mk = (left, tops) => `<!doctype html><html><body style="margin:0"><div class="showcase-header-inner"><span class="showcase-wordmark" style="margin-left:${left}px">B</span></div><div class="blixis-showcase-hero"><p class="showcase-eyebrow" style="margin:0 0 0 40px">e</p><h1 style="margin:0 0 0 40px">h</h1></div><ul class="blixis-showcase-features-list" style="list-style:none;margin:0 0 0 40px;padding:0;display:flex;align-items:flex-start">${tops.map((t) => `<li style="margin-top:${t}px;width:80px"><span class="showcase-feature-icon" style="display:block">i</span></li>`).join('')}</ul><div class="blixis-showcase-status" style="margin-left:0;width:1440px"><h2 style="margin:0 0 0 40px">s</h2><div class="blixis-showcase-card" style="margin-left:40px">c</div></div><div class="showcase-footer-inner"><span class="showcase-wordmark" style="margin-left:40px">B</span></div></body></html>`;
  await page.setContent(mk(40, [0, 0, 0, 0]));
  const ok = layoutProblems(await page.evaluate(layoutFn, LAYOUT_SPEC));
  const edgeOnly = ok.filter((p) => /left edges/.test(p));
  check('control: layout audit accepts aligned left edges', edgeOnly.length === 0, ok.join('; '));
  await page.setContent(mk(90, [0, 16, 0, 0]));
  const bad = layoutProblems(await page.evaluate(layoutFn, LAYOUT_SPEC));
  check('control: layout audit reports a shifted wordmark and a feature row 16px lower', bad.some((p) => /left edges differ/.test(p)) && bad.some((p) => /row tops differ/.test(p)), bad.join('; '));
  await browser.close();
}
writeFileSync('shots/report.json', JSON.stringify({ fails, axe: report.axe, contrast: report.contrast, checks: report.checks }, null, 2));
if (ran === 0) console.log('HARNESS no browser ran');
console.log(`DONE-BROWSER fails=${fails}`);
process.exit(fails === 0 ? 0 : 1);
