// Task 02-04 browser stage. Drives real browsers against the throwaway WordPress site and
// prints PASS/FAIL/NOTE lines (one FAIL per violated expectation, with the offending detail).
// Per route: landmarks, headings, skip link, keyboard path, overflow, privacy, axe-core, and a
// semantic outline snapshot. Ends with DONE-BROWSER. Exit 0 only when nothing failed.
import { chromium, firefox } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:8080';
const UPDATE = process.env.T0204_UPDATE === '1';
const AXE = readFileSync('vendor/axe.min.js', 'utf8');
const WIDTHS = [320, 768, 1280];
const SECRETS = ['T0204-DRAFT-BODY', 'T0204 Draft Secret', 'T0204-PRIVATE-BODY', 'T0204 Private Secret', 'T0204-PENDING-BODY', 'T0204 Pending Secret', 'T0204-FUTURE-BODY', 'T0204 Future Secret', 'T0204-DRAFTPAGE-BODY', 'T0204 Draft Page', 'T0204-PROTECTED-BODY', process.env.T0204_PROTECTED_PASSWORD];
const XSS = '"><img src=x onerror="window.__t0204_xss=1">';

let fails = 0;
let current = '';
const report = { checks: [], axe: {} };
const check = (name, ok, detail = '') => {
  if (!ok) fails++;
  const line = `${ok ? 'PASS' : 'FAIL'} [${current}] ${name}${!ok && detail ? ' -- ' + String(detail).slice(0, 600).replace(/\n/g, ' | ') : ''}`;
  report.checks.push(line);
  console.log(line);
};
const note = (name, value) => console.log(`NOTE [${current}] ${name}: ${String(value).slice(0, 400)}`);
mkdirSync('shots/outlines', { recursive: true });

// id: snapshot name; kind: how the route is expected to render.
const CASES = [
  { id: 'front-posts', url: '/', kind: 'list', status: 200, front: true },
  { id: 'front-static', url: '/?t0204_front=1', kind: 'singular', status: 200, front: true, marker: 'T0204-FRONT-BODY' },
  { id: 'page', url: '/?page_id=5001', kind: 'singular', status: 200, h1: 'Sample Page', marker: 'T0204-PAGE-BODY' },
  { id: 'single', url: '/?p=5101', kind: 'singular', status: 200, h1: 'First Post', marker: 'T0204-POST-BODY' },
  { id: 'archive-category', url: '/?category_name=fixtures', kind: 'list', status: 200, marker: 'First Post' },
  { id: 'archive-category-page2', url: '/?category_name=fixtures&paged=2', kind: 'list', status: 200 },
  { id: 'archive-date', url: '/?m=202601', kind: 'list', status: 200, marker: 'First Post' },
  { id: 'search-results', url: '/?s=Filler', kind: 'list', status: 200, marker: 'Filler Post', search: true },
  { id: 'search-empty', url: '/?s=zzzqnomatch', kind: 'none', status: 200, search: true },
  { id: 'search-blank', url: '/?s=', kind: 'any', status: 200, search: true },
  { id: 'search-hostile', url: '/?s=' + encodeURIComponent(XSS), kind: 'none', status: 200, search: true, hostile: true },
  { id: '404', url: '/?p=999999', kind: 'none', status: 404, search: true },
  { id: '404-paged', url: '/?category_name=fixtures&paged=99', kind: 'none', status: 404, search: true },
  { id: 'draft-post', url: '/?p=5201', kind: 'none', status: 404, search: true },
  { id: 'private-post', url: '/?p=5202', kind: 'none', status: 404, search: true },
  { id: 'future-post', url: '/?p=5205', kind: 'none', status: 404, search: true },
  { id: 'draft-page', url: '/?page_id=5206', kind: 'none', status: 404, search: true },
  { id: 'protected-post', url: '/?p=5203', kind: 'singular', status: 200, password: true },
  { id: 'edge-long-content', url: '/?p=5301', kind: 'singular', status: 200, marker: 'T0204-LONG-BODY' },
  { id: 'edge-special-chars', url: '/?p=5302', kind: 'singular', status: 200, h1: 'Tom & Jerry\'s "Quotes" 日本語 😀', marker: 'T0204-SPECIAL-BODY' },
  { id: 'edge-no-title', url: '/?p=5303', kind: 'singular', status: 200, noTitle: true },
];
const LOCALES = [
  { id: 'nl', query: 't0204_locale=nl_NL', lang: /^nl/, dir: 'ltr', cases: ['page', 'search-empty', '404'] },
  { id: 'rtl', query: 't0204_locale=ar', lang: /^ar/, dir: 'rtl', cases: ['page', 'single', 'archive-category', '404'] },
];
const withQuery = (url, q) => url + (url.includes('?') ? '&' : '?') + q;

// A navigation superseded by a just-finished form submission reports ERR_ABORTED; retry once.
async function go(page, url) {
  for (let attempt = 0; ; attempt++) {
    try { return await page.goto(url, { waitUntil: 'load' }); } catch (e) {
      if (attempt > 0 || !/ERR_ABORTED/.test(e.message)) throw e;
      await page.waitForTimeout(300);
    }
  }
}

// ---- In-page helpers (serialised into the page).
const outlineFn = () => {
  const q = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
  const lines = [];
  const root = document.documentElement;
  lines.push(`html lang=${root.lang} dir=${getComputedStyle(root).direction}`);
  lines.push(`title ${JSON.stringify(q(document.title))}`);
  const viewport = document.querySelector('meta[name=viewport]');
  lines.push(`viewport ${viewport ? viewport.content.replace(/\s+/g, '') : 'MISSING'}`);
  const name = (el) => {
    if (el.getAttribute('aria-label')) return q(el.getAttribute('aria-label'));
    const by = el.getAttribute('aria-labelledby');
    if (by) return q(by.split(/\s+/).map((id) => document.getElementById(id)?.textContent).join(' '));
    return '';
  };
  const SKIP = new Set(['SCRIPT', 'STYLE', 'SVG', 'TEMPLATE', 'NOSCRIPT', 'LINK', 'META']);
  const walk = (el, depth) => {
    for (const child of el.children) {
      if (SKIP.has(child.tagName.toUpperCase())) continue;
      const tag = child.tagName.toLowerCase();
      let line = null;
      let descend = true;
      if (child.matches('a.skip-link')) { line = `skip-link href=${child.getAttribute('href')} ${JSON.stringify(q(child.textContent))}`; descend = false; }
      else if (['header', 'footer', 'main', 'aside', 'article'].includes(tag)) line = tag + (name(child) ? ` ${JSON.stringify(name(child))}` : '');
      else if (tag === 'nav') {
        const links = [...child.querySelectorAll('a')].map((a) => q(a.textContent)).filter(Boolean);
        line = `nav ${JSON.stringify(name(child))} links=${JSON.stringify(links)}`; descend = false;
      } else if (/^h[1-6]$/.test(tag)) { line = `${tag} ${JSON.stringify(q(child.textContent))}`; descend = false; }
      else if (tag === 'form') { line = `form${child.getAttribute('role') === 'search' || child.querySelector('input[type=search]') ? ' search' : ''}${child.classList.contains('post-password-form') ? ' password' : ''}`; }
      else if (tag === 'input' && child.type !== 'hidden') { const lab = child.labels?.[0] ? q(child.labels[0].textContent) : name(child); line = `input type=${child.type} label=${JSON.stringify(lab)}`; }
      else if (tag === 'button') { line = `button ${JSON.stringify(q(child.textContent) || name(child))}`; descend = false; }
      else if (tag === 'img') { line = `img alt=${JSON.stringify(child.getAttribute('alt'))}`; }
      else if (tag === 'ul' || tag === 'ol') { if (!child.closest('nav')) line = `${tag} items=${child.children.length}`; }
      else if (tag === 'section' && name(child)) line = `section ${JSON.stringify(name(child))}`;
      if (line !== null) lines.push('  '.repeat(depth) + line);
      if (descend) walk(child, line !== null ? depth + 1 : depth);
    }
  };
  walk(document.body, 0);
  return lines.join('\n') + '\n';
};

const structureFn = () => {
  const q = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const label = (el) => q(el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') ? document.getElementById(el.getAttribute('aria-labelledby'))?.textContent : ''));
  const scoped = (selector) => [...document.querySelectorAll(selector)].filter((el) => !el.closest('article, aside, main, nav, section'));
  const h1s = [...document.querySelectorAll('h1')];
  const navs = [...document.querySelectorAll('nav, [role=navigation]')];
  const main = document.querySelector('main');
  const skips = [...document.querySelectorAll('a.skip-link')];
  const target = skips[0] ? document.getElementById(decodeURIComponent((skips[0].getAttribute('href') || '').slice(1))) : null;
  const banner = scoped('body header, body [role=banner]');
  const content = scoped('body footer, body [role=contentinfo]');
  const pos = (a, b) => (a && b ? Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) : null);
  const meta = document.querySelector('meta[name=viewport]')?.content ?? '';
  return {
    mains: document.querySelectorAll('main, [role=main]').length,
    banners: banner.length,
    contentinfos: content.length,
    bannerInsideMain: banner.some((el) => main?.contains(el)),
    h1: h1s.map((h) => q(h.textContent)),
    h1InMain: h1s.every((h) => main?.contains(h)),
    h1Visible: h1s.every(vis),
    navs: navs.map((n) => ({ label: label(n), links: n.querySelectorAll('a').length })),
    skipCount: skips.length,
    skipText: skips[0] ? q(skips[0].textContent) : '',
    skipHref: skips[0]?.getAttribute('href') ?? '',
    skipTarget: target ? { tag: target.tagName, isMainOrInside: target === main || Boolean(main?.contains(target)), copies: document.querySelectorAll(`[id="${CSS.escape(target.id)}"]`).length } : null,
    order: { bannerBeforeMain: pos(banner[0], main), mainBeforeFooter: pos(main, content[0]) },
    lang: document.documentElement.lang,
    dir: getComputedStyle(document.documentElement).direction,
    title: q(document.title),
    viewport: meta,
    searchLandmarks: document.querySelectorAll('[role=search], search, form[role=search]').length,
    searchInputs: [...document.querySelectorAll('input[type=search]')].map((i) => ({ name: label(i) || q(i.labels?.[0]?.textContent) || i.getAttribute('placeholder') || '' })),
    postItems: document.querySelectorAll('main .wp-block-post-template > li, main li.wp-block-post').length,
    mainText: q(main?.innerText),
    html: document.documentElement.outerHTML,
    animations: document.getAnimations().filter((a) => a.playState === 'running').length,
    smoothScroll: getComputedStyle(document.documentElement).scrollBehavior,
    passwordInputs: document.querySelectorAll('input[type=password]').length,
  };
};

const overflowFn = () => {
  const doc = document.documentElement;
  const width = doc.clientWidth;
  const offenders = [];
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const rtl = getComputedStyle(doc).direction === 'rtl';
    if ((!rtl && r.right > width + 1) || (rtl && r.left < -1)) {
      let clipped = false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') { clipped = true; break; } }
      if (!clipped) offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/).slice(0, 2).join('.')} r=${Math.round(r.right)} l=${Math.round(r.left)}`);
    }
  }
  if (!offenders.length && doc.scrollWidth > width) {
    // Unbreakable text overflows its own box without enlarging the box rectangle.
    const wide = [...document.body.querySelectorAll('*')].filter((el) => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1 && !['auto', 'scroll', 'hidden'].includes(getComputedStyle(el).overflowX)).sort((x, y) => y.scrollWidth - x.scrollWidth).slice(0, 3);
    for (const el of wide) offenders.push(`text overflows ${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/).slice(0, 2).join('.')} scrollWidth=${el.scrollWidth} clientWidth=${el.clientWidth}`);
  }
  return { scrollWidth: doc.scrollWidth, clientWidth: width, offenders: offenders.slice(0, 5) };
};

// ---- Browser-level helpers.
async function runAxe(page, label, { tags, rules, off = [] } = {}) {
  await page.addScriptTag({ content: AXE });
  const result = await page.evaluate(async ({ tags, rules, off }) => {
    const options = rules ? { runOnly: { type: 'rule', values: rules } } : { runOnly: { type: 'tag', values: tags }, rules: Object.fromEntries(off.map((id) => [id, { enabled: false }])) };
    const r = await window.axe.run(document, { ...options, resultTypes: ['violations', 'incomplete'] });
    const pick = (list) => list.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => `${n.target.join(' ')} :: ${(n.failureSummary || '').replace(/\s+/g, ' ').slice(0, 160)}`), count: v.nodes.length }));
    return { violations: pick(r.violations), incomplete: pick(r.incomplete) };
  }, { tags, rules, off });
  report.axe[`${current} ${label}`] = result;
  return result;
}
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

async function keyboardPath(page, c) {
  await go(page, BASE + c.url);
  await page.evaluate(() => { window.scrollTo(0, 0); document.activeElement?.blur?.(); });
  const seen = [];
  const handles = [];
  let trap = null;
  for (let i = 0; i < 90; i++) {
    await page.keyboard.press('Tab');
    const handle = await page.evaluateHandle(() => document.activeElement);
    const info = await handle.evaluate((el) => {
      if (!el || el === document.body || el === document.documentElement) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || el.getAttribute('aria-label') || el.getAttribute('name') || '').replace(/\s+/g, ' ').trim().slice(0, 40),
        region: el.matches('a.skip-link') ? 'skip' : el.closest('main') ? 'main' : el.closest('footer') ? 'footer' : el.closest('header') ? 'header' : 'other',
        rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
        visible: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.opacity !== '0',
        onScreen: r.right > 0 && r.left < innerWidth,
        outline: `${cs.outlineStyle} ${cs.outlineWidth}`,
        paint: [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.boxShadow, cs.backgroundColor, cs.color, cs.textDecorationLine, cs.borderTopColor].join('|'),
      };
    });
    if (info === null) break; // focus left the document (browser UI) or returned to body
    const prev = seen.at(-1);
    if (prev && prev.tag === info.tag && prev.text === info.text && prev.rect.join() === info.rect.join()) {
      // Firefox keeps focus on the last stop instead of leaving to browser UI.
      const isLast = await handle.evaluate((el) => { const all = [...document.querySelectorAll('a[href], button:not([disabled]), input:not([type=hidden]):not([disabled]), select, textarea, summary, [tabindex]:not([tabindex="-1"])')].filter((e) => e.getBoundingClientRect().width > 0); return all.at(-1) === el; });
      if (!isLast) trap = info;
      break;
    }
    seen.push(info);
    handles.push(handle);
  }
  const reachedEnd = !trap && seen.length < 90;
  // Blurred paint for each focused element, to prove focus is visible.
  const unfocused = [];
  await page.evaluate(() => document.activeElement?.blur?.());
  for (const h of handles) unfocused.push(await h.evaluate((el) => { const cs = getComputedStyle(el); return [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.boxShadow, cs.backgroundColor, cs.color, cs.textDecorationLine, cs.borderTopColor].join('|'); }));
  return { seen, unfocused, trap, reachedEnd, handles };
}

function diff(expected, actual) {
  const a = expected.split('\n'); const b = actual.split('\n');
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length) && out.length < 12; i++) if (a[i] !== b[i]) out.push(`L${i + 1} -${a[i] ?? '∅'} +${b[i] ?? '∅'}`);
  return out.join(' | ');
}

async function structureChecks(page, c, s, response, { locale } = {}) {
  check(`status ${c.status}`, response?.status() === c.status, response?.status());
  check('exactly one main landmark', s.mains === 1, `found ${s.mains}`);
  check('one banner (header) outside sectioning content', s.banners === 1 && !s.bannerInsideMain, `banners=${s.banners} insideMain=${s.bannerInsideMain}`);
  check('one contentinfo (footer) outside sectioning content', s.contentinfos === 1, `found ${s.contentinfos}`);
  check('landmark order: header, main, footer', s.order.bannerBeforeMain === true && s.order.mainBeforeFooter === true, JSON.stringify(s.order));
  check('at least one navigation landmark; each has a unique accessible name', s.navs.length >= 1 && s.navs.every((n) => n.label) && new Set(s.navs.map((n) => n.label)).size === s.navs.length, JSON.stringify(s.navs));
  check('every navigation has links', s.navs.every((n) => n.links > 0), JSON.stringify(s.navs));
  if (c.noTitle) {
    check('empty-title post still renders main, header, footer', s.mains === 1 && s.banners === 1 && s.contentinfos === 1);
    if (s.h1.length !== 1) note('empty-title post has no h1 (core renders nothing for an empty title)', s.h1.length);
  } else {
    check('exactly one h1', s.h1.length === 1 && s.h1[0].length > 0, JSON.stringify(s.h1));
    check('h1 is visible', s.h1Visible);
    if (!c.front) check('h1 is inside main', s.h1InMain);
  }
  const plain = (t) => t.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"'); // core wptexturize curls quotes
    if (c.h1) check(`h1 text is exactly the title (escaped once, not double-encoded)`, plain(s.h1[0] ?? '') === c.h1, JSON.stringify(s.h1));
  if (c.marker) check(`published content is rendered (${c.marker})`, s.mainText.includes(c.marker), s.mainText.slice(0, 200));
  check('document has lang, a non-empty title, and a scalable viewport', Boolean(s.lang) && s.title.length > 0 && /width=device-width/.test(s.viewport) && !/user-scalable=(no|0)|maximum-scale=1(\.0)?\b/.test(s.viewport), `${s.lang} | ${s.title} | ${s.viewport}`);
  check('exactly one skip link', s.skipCount === 1, `found ${s.skipCount}`);
  check('skip link text is not empty', s.skipText.length > 0);
  check('skip link targets a unique id inside main', s.skipHref.startsWith('#') && s.skipTarget?.isMainOrInside === true && s.skipTarget.copies === 1, JSON.stringify([s.skipHref, s.skipTarget]));
  if (!locale) check('skip link uses the English core label', s.skipText === 'Skip to content', s.skipText);
  if (c.search) {
    check('search form is a labelled search landmark', s.searchLandmarks >= 1 && s.searchInputs.length >= 1 && s.searchInputs.every((i) => i.name), JSON.stringify([s.searchLandmarks, s.searchInputs]));
  }
  if (c.kind === 'list') check('post list has items', s.postItems >= 1, s.postItems);
  if (c.kind === 'none') check('no post items in a no-result view', s.postItems === 0, s.postItems);
  if (c.kind === 'none' && c.status === 200) check('no-results view explains itself in main', s.mainText.length > 20, s.mainText);
  if (c.password) check('protected post shows a password form and not the body', s.passwordInputs === 1 && !s.mainText.includes('T0204-PROTECTED-BODY'), `${s.passwordInputs}`);
  if (c.hostile) {
    check('hostile search query does not execute or inject markup', (await page.evaluate(() => window.__t0204_xss)) === undefined && (await page.locator('img[src="x"]').count()) === 0);
    check('hostile query is shown as escaped text or not shown at all', s.mainText.includes('<img src=x') || !s.mainText.includes('onerror'), s.mainText.slice(0, 160));
  }
  const leaks = SECRETS.filter((x) => x && s.html.includes(x));
  check('no draft, private, pending, scheduled, or protected content or secret in the HTML', leaks.length === 0, leaks.join(', '));
  check('reduced motion: no running animations and no smooth scrolling', s.animations === 0 && s.smoothScroll !== 'smooth', `${s.animations} ${s.smoothScroll}`);
}

async function skipLinkFlow(page, c) {
  await go(page, BASE + c.url);
  await page.keyboard.press('Tab');
  const first = await page.evaluate(() => {
    const el = document.activeElement; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return { skip: el.matches?.('a.skip-link') ?? false, w: r.width, h: r.height, inView: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, visibility: cs.visibility, opacity: cs.opacity, clip: cs.clip, center: (r.left + r.right) / 2 / innerWidth };
  });
  check('first Tab focuses the skip link', first.skip);
  check('focused skip link is visible and fully inside the viewport', first.w >= 20 && first.h >= 16 && first.inView && first.visibility === 'visible' && first.opacity !== '0', JSON.stringify(first));
  const axeFocused = await runAxe(page, 'skip-focused', { rules: ['color-contrast', 'skip-link', 'bypass'] });
  check('axe: focused skip link has sufficient contrast and a valid target', axeFocused.violations.length === 0, JSON.stringify(axeFocused.violations));
  await page.keyboard.press('Enter');
  const after = await page.evaluate(() => ({ hash: location.hash, main: Boolean(document.activeElement && document.querySelector('main')?.contains(document.activeElement)), active: document.activeElement?.tagName }));
  check('Enter moves to the skip target hash', after.hash.length > 1, after.hash);
  await page.keyboard.press('Tab');
  const next = await page.evaluate(() => { const el = document.activeElement; return { inHeader: Boolean(el?.closest('header')), inMain: Boolean(el?.closest('main')), inFooter: Boolean(el?.closest('footer')), isSkip: Boolean(el?.matches('a.skip-link')), tag: el?.tagName }; });
  check('after the skip link, the next Tab skips the header and lands in main or later', !next.inHeader && !next.isSkip, JSON.stringify(next));
  // Hidden again when unfocused.
  await go(page, BASE + c.url);
  const hidden = await page.evaluate(() => { const r = document.querySelector('a.skip-link').getBoundingClientRect(); const cs = getComputedStyle(document.querySelector('a.skip-link')); return { visualHidden: r.right <= 1 || r.bottom <= 1 || r.width <= 1 || r.height <= 1 || r.left < -100 || cs.clip !== 'auto', display: cs.display }; });
  check('unfocused skip link is visually hidden but not display:none', hidden.visualHidden && hidden.display !== 'none', JSON.stringify(hidden));
}

async function keyboardChecks(page, c) {
  const k = await keyboardPath(page, c);
  const { seen, unfocused, trap, reachedEnd } = k;
  check('keyboard: focus order starts at the skip link', seen[0]?.region === 'skip', JSON.stringify(seen[0]));
  const rank = { skip: 0, header: 1, main: 2, footer: 3, other: 2 };
  const ranks = seen.filter((x) => x.region !== 'other').map((x) => rank[x.region]);
  check('keyboard: focus moves header, then main, then footer', ranks.every((r, i) => i === 0 || r >= ranks[i - 1]), seen.map((x) => x.region).join('>'));
  check('keyboard: no focus trap and the end of the page is reachable', !trap && reachedEnd, trap ? JSON.stringify(trap) : 'did not leave the document in 90 tabs');
  const hiddenFocus = seen.filter((x) => !x.visible || !x.onScreen);
  check('keyboard: every focus stop is visible and on screen', hiddenFocus.length === 0, JSON.stringify(hiddenFocus.map((x) => [x.tag, x.text, x.rect])));
  const noRing = seen.filter((x, i) => x.paint === unfocused[i] && !(x.outline.split(' ')[0] !== 'none' && parseFloat(x.outline.split(' ')[1]) > 0));
  check('keyboard: every focus stop has a visible focus indicator', noRing.length === 0, JSON.stringify(noRing.map((x) => [x.tag, x.text])));
  // Every natively focusable, rendered control must be in the tab sequence.
  const reachable = await page.evaluate(() => [...document.querySelectorAll('a[href], button:not([disabled]), input:not([type=hidden]):not([disabled]), select, textarea, summary, [tabindex]:not([tabindex="-1"])')]
    .filter((el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden'; })
    .map((el) => (el.textContent || el.getAttribute('aria-label') || el.name || '').replace(/\s+/g, ' ').trim().slice(0, 40)));
  const seenText = seen.map((x) => x.text);
  const missing = reachable.filter((t) => !seenText.includes(t));
  check('keyboard: every rendered interactive control is reachable by Tab', missing.length === 0, missing.join(', '));
  // Shift+Tab returns along the same path.
  if (seen.length >= 3) {
    await go(page, BASE + c.url);
    for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    const back = await page.evaluate(() => { const el = document.activeElement; return (el.textContent || el.getAttribute('aria-label') || el.getAttribute('name') || '').replace(/\s+/g, ' ').trim().slice(0, 40); });
    check('keyboard: Shift+Tab moves back to the previous stop', back === seen[1].text, `${back} vs ${seen[1].text}`);
  }
  note('tab stops', seen.map((x) => `${x.region}:${x.text}`).join(' > '));
}

async function searchForm(page, c) {
  await go(page, BASE + c.url);
  const box = page.getByRole('searchbox').first();
  if (!(await box.count())) { check('search form can be used from the keyboard', false, 'no searchbox role'); return; }
  await box.focus();
  await page.keyboard.type('Filler');
  await Promise.all([page.waitForURL(/[?&]s=Filler/, { waitUntil: 'load' }), page.keyboard.press('Enter')]);
  await page.waitForLoadState('load');
  check('search form submits with Enter and lands on the search template', /[?&]s=Filler/.test(page.url()) && (await page.locator('main').count()) === 1);
}

async function responsiveMenu(page, c) {
  await page.setViewportSize({ width: 320, height: 700 });
  await go(page, BASE + c.url);
  const open = page.locator('button.wp-block-navigation__responsive-container-open:visible').first();
  if (!(await open.count())) { note('responsive menu', 'no menu toggle at 320px (links shown inline); toggle behaviour not exercised'); return; }
  await open.focus();
  await page.keyboard.press('Enter');
  const dialog = page.locator('.wp-block-navigation__responsive-container.is-menu-open');
  check('responsive menu opens from the keyboard', await dialog.isVisible());
  const links = await dialog.locator('a:visible').count();
  check('responsive menu exposes its links', links > 0, links);
  await page.keyboard.press('Escape');
  check('Escape closes the menu and returns focus to the toggle', !(await dialog.isVisible()) && (await open.evaluate((el) => el === document.activeElement)));
}

async function runCase(page, c, ctx, tag = '') {
  const label = (c.id + tag);
  current = `${ctx.browser}:${label}`;
  await page.setViewportSize({ width: 1280, height: 900 });
  const failures = [];
  const external = [];
  const bad = [];
  const onConsole = (m) => { if (m.type() === 'error' && !/favicon/.test(m.text()) && !/Failed to load resource.*(404|403)/.test(m.text())) failures.push(m.text()); };
  const onError = (e) => failures.push(String(e));
  const onRequest = (r) => { if (!r.url().startsWith(BASE) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url()); };
  const onResponse = (r) => { if (r.status() >= 400 && r.request().resourceType() !== 'document' && !/favicon/.test(r.url())) bad.push(`${r.status()} ${r.url()}`); };
  page.on('console', onConsole); page.on('pageerror', onError); page.on('request', onRequest); page.on('response', onResponse);

  const response = await go(page, BASE + withQuery(c.url, ctx.query ?? ''));
  const s = await page.evaluate(structureFn);
  await structureChecks(page, c, s, response, { locale: ctx.locale });
  if (ctx.locale) {
    const header = response.headers();
    const expected = decodeURIComponent(header['x-t0204-expected-skip'] ?? '');
    check(`locale ${ctx.locale.id}: server used the requested locale`, ctx.locale.lang.test(s.lang), s.lang);
    check(`locale ${ctx.locale.id}: dir is ${ctx.locale.dir}`, s.dir === ctx.locale.dir && (await page.evaluate(() => document.documentElement.dir || getComputedStyle(document.documentElement).direction)) === ctx.locale.dir);
    check(`locale ${ctx.locale.id}: skip link is the core translation, not English`, expected.length > 0 && s.skipText === expected && s.skipText !== 'Skip to content', `${JSON.stringify(s.skipText)} vs ${JSON.stringify(expected)}`);
    check(`locale ${ctx.locale.id}: body class matches direction`, ctx.locale.dir === 'rtl' ? await page.evaluate(() => document.body.classList.contains('rtl')) : true);
  }

  // Responsive: no horizontal overflow at 320 (reflow), 768, 1280.
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    await go(page, BASE + withQuery(c.url, ctx.query ?? ''));
    const o = await page.evaluate(overflowFn);
    check(`no horizontal overflow at ${width}px`, o.scrollWidth <= o.clientWidth, `scrollWidth ${o.scrollWidth} > ${o.clientWidth}; ${o.offenders.join('; ')}`);
    if (width === 320 || width === 1280) {
      const a = await runAxe(page, `${width}`, { tags: AXE_TAGS, off: c.noTitle ? ['page-has-heading-one'] : [] }); // empty title: reported as a NOTE above
      check(`axe-core ${AXE_VERSION()} finds no violations at ${width}px`, a.violations.length === 0, a.violations.map((v) => `${v.id}(${v.count}) ${v.nodes[0]}`).join(' || '));
      if (a.incomplete.length) note(`axe needs-review at ${width}px`, a.incomplete.map((v) => v.id).join(','));
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  if (width1280Screenshot) await page.screenshot({ path: `shots/${ctx.browser}-${label}.png`, fullPage: true });

  if (!ctx.locale) {
    await go(page, BASE + c.url);
    const outline = await page.evaluate(outlineFn);
    const file = `snapshots/${c.id}.txt`;
    writeFileSync(`shots/outlines/${c.id}.txt`, outline);
    if (UPDATE) note('snapshot written', file);
    else if (!existsSync(file)) check('semantic snapshot exists', false, `missing ${file}; review the rendered outline and run tests/02-04/run.sh --update-snapshots`);
    else {
      const expected = readFileSync(file, 'utf8');
      check('semantic snapshot matches', expected === outline, diff(expected, outline));
    }
    await skipLinkFlow(page, c);
    await keyboardChecks(page, c);
    if (['search-results', 'search-empty', '404'].includes(c.id)) await searchForm(page, c);
    if (c.id === 'page' || c.id === 'front-posts') await responsiveMenu(page, c);
  } else {
    await page.goto(BASE + withQuery(c.url, ctx.query), { waitUntil: 'load' });
    await page.keyboard.press('Tab');
    const skip = await page.evaluate(() => { const el = document.activeElement; const r = el.getBoundingClientRect(); return { skip: el.matches('a.skip-link'), inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0, centerX: Math.round(((r.left + r.right) / 2 / innerWidth) * 100) }; });
    check('first Tab focuses the translated skip link, fully on screen', skip.skip && skip.inView, JSON.stringify(skip));
    note('skip link horizontal centre (% of viewport)', skip.centerX);
  }

  check('no console errors or uncaught exceptions', failures.length === 0, failures.join(' | '));
  check('no third-party requests', external.length === 0, external.join(', '));
  check('no failed sub-resource requests', bad.length === 0, bad.join(', '));
  page.off('console', onConsole); page.off('pageerror', onError); page.off('request', onRequest); page.off('response', onResponse);
}
const width1280Screenshot = true;
const AXE_VERSION = () => '4.14.0';

// ---- Anonymous API/feeds must not leak either.
async function apiPrivacy(context) {
  current = 'privacy';
  const get = (path) => context.request.get(BASE + path);
  // Plain permalinks: REST is addressed with rest_route. A JSON body proves the route answered.
  for (const path of ['/?rest_route=/wp/v2/posts&search=T0204&per_page=50&status=any', '/?rest_route=/wp/v2/pages&search=T0204&per_page=50', '/?feed=rss2']) {
    const r = await get(path);
    const body = await r.text();
    const leaks = SECRETS.filter((x) => x && body.includes(x));
    const answered = path.includes('feed') ? /<rss/.test(body) : r.headers()['content-type']?.includes('json');
    check(`anonymous ${path.includes('feed') ? 'feed' : 'REST list'} answers and exposes no non-public content or password`, answered && leaks.length === 0, `${r.status()} ${leaks.join(',')}`);
  }
  for (const id of [5201, 5202, 5204, 5205]) {
    const r = await get(`/?rest_route=/wp/v2/posts/${id}`);
    check(`anonymous REST read of non-public post ${id} is refused`, [401, 403, 404].includes(r.status()) && !(await r.text()).includes('T0204-'), r.status());
  }
}

const engines = { chromium, firefox };
const wanted = (process.env.T0204_BROWSERS || 'chromium').split(',').filter(Boolean);
let ran = 0;
for (const name of wanted) {
  const engine = engines[name];
  if (!engine) { console.log(`HARNESS unknown browser ${name}`); continue; }
  const browser = await engine.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', deviceScaleFactor: 1 });
  const page = await context.newPage();
  const guarded = async (c, ctx, tag) => {
    try { await runCase(page, c, ctx, tag); } catch (e) { current = `${name}:${c.id}${tag ?? ''}`; let more = '';
      try { const r = await context.request.get(BASE + c.url); more = ` | direct GET ${r.status()} ${(await r.text()).replace(/\s+/g, ' ').slice(0, 160)}`; } catch (e2) { more = ` | direct GET failed: ${e2.message.split('\n')[0]}`; }
      check('route test completed without a browser error', false, e.message.split('\n')[0] + more); }
  };
  for (const c of CASES) await guarded(c, { browser: name });
  for (const locale of LOCALES) for (const id of locale.cases) await guarded(CASES.find((c) => c.id === id), { browser: name, query: locale.query, locale }, `@${locale.id}`);
  if (name === wanted[0]) await apiPrivacy(context);
  await browser.close();
  ran++;
}
// Control: the audit must be able to fail. A page with a known violation has to be reported.
{
  const browser = await chromium.launch();
  const page = await browser.newPage();
  current = 'control';
  await page.setContent('<!doctype html><html><head><title>t</title></head><body><img src="x.png"><a href="#"></a></body></html>');
  const a = await runAxe(page, 'control', { tags: AXE_TAGS });
  check('control: axe reports violations on a deliberately broken page (the audit can fail)', a.violations.some((v) => v.id === 'image-alt') && a.violations.some((v) => v.id === 'html-has-lang'), a.violations.map((v) => v.id).join(','));
  await browser.close();
}
writeFileSync('shots/report.json', JSON.stringify({ fails, axe: report.axe, checks: report.checks }, null, 2));
if (ran === 0) console.log('HARNESS no browser ran');
console.log(`DONE-BROWSER fails=${fails}`);
process.exit(fails === 0 ? 0 : 1);
