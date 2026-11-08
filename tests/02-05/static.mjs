// Task 02-05 static checks of the optional showcase child theme. No Docker, no dependencies.
// Usage: node tests/02-05/static.mjs [child-theme-dir] [base-theme-dir]   (exit 0 pass, 1 fail)
// Importable: discoverChild(themesRoot), checkChild(child, base, rights) return failure arrays.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, join, resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

const read = (f) => readFileSync(f, 'utf8');
const walk = (dir) => (existsSync(dir) ? readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile() && !String(e.parentPath).includes('node_modules')).map((e) => join(e.parentPath, e.name)) : []);
const TEXT = new Set(['.php', '.html', '.json', '.css', '.js', '.mjs', '.svg', '.txt', '.md']);
const BINARY = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.woff', '.woff2', '.ttf', '.otf', '.mp4', '.webm']);
const header = (css, key) => css.match(new RegExp(`^\\s*(?:\\*\\s*)?${key}:\\s*(.+)$`, 'mi'))?.[1].trim();
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');

// Claims the theme must not make before the capability exists. A line that says planned/later is fine.
export const CLAIMS = /\b(drag[- ]and[- ]drop|page builder|setup wizard|onboarding wizard|visual (?:editor|builder)|live (?:token|style) editor|element registry|blixis blocks|one-click (?:install|setup)|AI[- ](?:generated|powered|assistant)|headless|content api|REST API|cloud sync|marketplace|certified|WCAG (?:2\.\d )?(?:AA )?(?:compliant|conformant|certified)|fully accessible)\b/i;
const HEDGE = /\b(planned|future|later|not (?:yet|implemented|available)|no |roadmap|coming)\b/i;

export function discoverChild(themesRoot) {
  if (!existsSync(themesRoot)) return null;
  for (const name of readdirSync(themesRoot).sort()) {
    const css = join(themesRoot, name, 'style.css');
    if (name !== 'blixis-base' && existsSync(css) && /^\s*Template:\s*blixis-base\s*$/mi.test(read(css))) return join(themesRoot, name);
  }
  return null;
}

export function checkChild(child, base, rights = { dir: null, readme: '' }) {
  const failures = [];
  const fail = (m) => failures.push(m);
  const css = existsSync(join(child, 'style.css')) ? read(join(child, 'style.css')) : '';
  const slug = basename(child);
  if (!css) fail('child style.css is missing');
  if (header(css, 'Template') !== 'blixis-base') fail('style.css Template must be blixis-base');
  for (const key of ['Theme Name', 'Version', 'License', 'Text Domain']) if (!header(css, key)) fail(`style.css lacks ${key}`);
  if (header(css, 'Text Domain') && header(css, 'Text Domain') !== slug) fail(`Text Domain ${header(css, 'Text Domain')} must equal the directory name ${slug}`);
  if (slug === 'blixis-base') fail('the child must not be the parent directory');

  if (slug === 'blixis-showcase') {
    const screenshot = join(child, 'screenshot.png');
    if (!existsSync(screenshot)) {
      fail('Showcase screenshot.png is missing from the child theme');
    } else {
      const png = readFileSync(screenshot);
      const valid = png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      if (!valid || png.length < 24 || png.readUInt32BE(16) !== 1200 || png.readUInt32BE(20) !== 900) fail('Showcase screenshot.png must be a 1200×900 PNG');
    }
  }

  const files = walk(child);
  const textFiles = files.filter((f) => TEXT.has(extname(f).toLowerCase()));
  for (const f of textFiles) {
    const text = read(f);
    const rel = f.slice(child.length + 1);
    // No third-party loads: stylesheets, fonts, scripts, images, frames must be local.
    for (const m of text.matchAll(/(?:src|href|url)\s*(?:=|\()\s*["']?(https?:)?\/\/([^"')\s>]+)/gi)) {
      const href = m[0];
      if (!/(?:www\.)?w3\.org|schemas\.wp\.org|developer\.wordpress\.org|wordpress\.org\/(?:themes|plugins|support)|gnu\.org|example\.(?:test|com)|github\.com\/EmVeeNL/i.test(m[2]) && !/<a\b[^>]*$/i.test(text.slice(Math.max(0, m.index - 80), m.index))) fail(`${rel}: external resource ${href.slice(0, 80)}`);
    }
    if (/@import\s+(?:url\()?["']?https?:/i.test(text)) fail(`${rel}: @import of a remote stylesheet`);
    if (/<script\b/i.test(text) && ['.html', '.php'].includes(extname(f))) fail(`${rel}: inline script in a template`);
    if (extname(f) === '.php' && /\b(eval|base64_decode|shell_exec|passthru|system|exec)\s*\(/.test(text)) fail(`${rel}: dangerous PHP function`);
    if (extname(f) === '.php' && !/^<\?php/.test(text.trimStart()) && !/^<\?php/.test(text)) fail(`${rel}: PHP file without an opening tag`);
    if (/(?:api[_-]?key|secret|password|token)\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']/i.test(text)) fail(`${rel}: looks like a credential`);
    if (/BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}/.test(text)) fail(`${rel}: secret material`);
    if (extname(f) !== '.css') text.split('\n').forEach((line, i) => { if (CLAIMS.test(line) && !HEDGE.test(line)) fail(`${rel}:${i + 1}: unimplemented capability claim: ${line.trim().slice(0, 100)}`); });
  }
  // theme.json, when present, is valid JSON on the current schema version.
  const tj = join(child, 'theme.json');
  if (existsSync(tj)) {
    try { const j = JSON.parse(read(tj)); if (typeof j.version !== 'number') fail('theme.json lacks a numeric version'); } catch (e) { fail(`theme.json is not valid JSON: ${e.message}`); }
  }
  // Child owns branding: Base must not mention the child (name, slug) anywhere.
  const baseFiles = walk(base).filter((f) => TEXT.has(extname(f).toLowerCase()) && !/assets\/build\//.test(f));
  const brand = [slug, header(css, 'Theme Name')].filter((s) => s && s.length > 3 && !/^blixis[- ]?(base)?$/i.test(s));
  for (const f of baseFiles) for (const b of brand) if (read(f).toLowerCase().includes(b.toLowerCase())) fail(`Base file ${f.slice(base.length + 1)} mentions the child "${b}"`);
  // Parent stays neutral: no webfonts or images shipped in Base, no child-only text domain.
  for (const f of walk(base)) if (BINARY.has(extname(f).toLowerCase())) fail(`Base ships a binary asset: ${f.slice(base.length + 1)}`);

  // Asset rights: every binary in the child is a documented, rights-confirmed docs/assets file or a licensed font listed there.
  for (const f of files.filter((f) => BINARY.has(extname(f).toLowerCase()))) {
    const rel = f.slice(child.length + 1);
    const hash = sha(f);
    const known = rights.dir && existsSync(rights.dir) && readdirSync(rights.dir).some((n) => statSync(join(rights.dir, n)).isFile() && BINARY.has(extname(n).toLowerCase()) && sha(join(rights.dir, n)) === hash && rights.readme.includes(n));
    if (!known && !rights.readme.includes(basename(f))) fail(`${rel}: binary asset has no rights entry in docs/assets/README.md`);
    if (['.woff', '.woff2', '.ttf', '.otf'].includes(extname(f).toLowerCase()) && !/(?:SIL Open Font|OFL|licen[sc]e)/i.test(rights.readme + files.filter((x) => /licen[sc]e|OFL/i.test(basename(x))).map(read).join(''))) fail(`${rel}: font without a licence record`);
  }
  // Images referenced from templates must carry alt (empty alt allowed only for decoration).
  for (const f of textFiles.filter((f) => ['.html', '.php'].includes(extname(f)))) for (const m of read(f).matchAll(/<img\b[^>]*>/gi)) if (!/\balt\s*=/.test(m[0])) fail(`${f.slice(child.length + 1)}: <img> without alt`);
  return failures;
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  const repo = resolve(import.meta.dirname, '../..');
  const base = resolve(process.argv[3] ?? join(repo, 'themes/blixis-base'));
  const child = process.argv[2] ? resolve(process.argv[2]) : discoverChild(join(repo, 'themes'));
  if (!child) { console.log('FAIL no child theme found (expected themes/<slug>/style.css with "Template: blixis-base"); expected until the 02-05 child theme branch is integrated'); process.exit(1); }
  const rightsDir = join(repo, 'docs/assets');
  const failures = checkChild(child, base, { dir: rightsDir, readme: existsSync(join(rightsDir, 'README.md')) ? read(join(rightsDir, 'README.md')) : '' });
  for (const f of failures) console.log(`FAIL ${f}`);
  console.log(failures.length ? `${failures.length} static failure(s) in ${child}` : `PASS static checks for ${child}`);
  process.exit(failures.length ? 1 : 0);
}
