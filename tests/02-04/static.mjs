// Task 02-04 static checks of the Base theme's block templates and parts. No Docker, no
// dependencies. Usage: node tests/02-04/static.mjs [theme-dir]   (exit 0 pass, 1 fail)
// Importable: checkTheme(dir) returns an array of failure strings (empty = pass).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const TEXT_DOMAIN = 'blixis-base';
const read = (file) => readFileSync(file, 'utf8');
const list = (dir, ext) => (existsSync(dir) ? readdirSync(dir, { recursive: true }).filter((f) => String(f).endsWith(ext)).map(String) : []);

// Block comment delimiters must nest: every opener has a closer, no stray closer.
function balanced(markup) {
  const stack = [];
  for (const m of markup.matchAll(/<!--\s*(\/)?wp:([a-z0-9/-]+)(\s[\s\S]*?)?(\/)?-->/g)) {
    const [, closing, name, , selfClosing] = m;
    if (selfClosing) continue;
    if (closing) {
      if (stack.pop() !== name) return false;
    } else stack.push(name);
  }
  return stack.length === 0;
}

const count = (haystack, re) => (haystack.match(re) ?? []).length;
const partRef = (markup, slug) => count(markup, new RegExp(`<!--\\s*wp:template-part\\s+\\{[^}]*"slug":"${slug}"`, 'g'));

export function checkTheme(theme) {
  const failures = [];
  const fail = (message) => failures.push(message);
  const templates = join(theme, 'templates');
  const parts = join(theme, 'parts');
  const has = (dir, name) => existsSync(join(dir, `${name}.html`));

  // Required template coverage. Singular may be one file or split page + single.
  for (const name of ['index', 'archive', 'search', '404']) if (!has(templates, name)) fail(`templates/${name}.html is missing`);
  if (!has(templates, 'singular') && !(has(templates, 'page') && has(templates, 'single'))) fail('templates need singular.html, or both page.html and single.html');
  if (!has(templates, 'page') && !has(templates, 'singular')) fail('no template can render a page');
  for (const name of ['header', 'footer']) if (!has(parts, name)) fail(`parts/${name}.html is missing`);

  const expandPatterns = (markup) => markup.replace(/<!--\s*wp:pattern\s+\{[^}]*"slug":"[^"/]+\/([a-z0-9-]+)"[^}]*\}\s*\/-->/g, (whole, slug) => {
      const pattern = join(theme, 'patterns', `${slug}.php`);
      return existsSync(pattern) ? read(pattern).replace(/<\?php[\s\S]*?\?>/g, '') : whole;
    });

  const templateFiles = list(templates, '.html');
  for (const file of templateFiles) {
    // Patterns referenced from a template count as part of it (h1 and main checks see their markup).
    const markup = expandPatterns(read(join(templates, file)));
    const label = `templates/${file}`;
    if (!balanced(markup)) fail(`${label}: block comments are unbalanced`);
    if (count(markup, /<main[\s>]/g) !== 1) fail(`${label}: needs exactly one <main> (found ${count(markup, /<main[\s>]/g)})`);
    if (count(markup, /"tagName":"main"/g) > 1) fail(`${label}: more than one main tagName`);
    // Exactly one h1 source in the template itself (raw h1, level-1 title blocks, query title default).
    const h1Sources = count(markup, /<h1[\s>]/g) + count(markup, /<!--\s*wp:(?:post-title|site-title)\s+\{[^}]*"level":1\b/g) + count(markup, /<!--\s*wp:query-title\b(?![^>]*"level":[2-6])/g);
    if (h1Sources !== 1) fail(`${label}: needs exactly one h1 source (found ${h1Sources})`);
    if (partRef(markup, 'header') !== 1) fail(`${label}: must reference the header part exactly once`);
    if (partRef(markup, 'footer') !== 1) fail(`${label}: must reference the footer part exactly once`);
    if (!/"slug":"header"[^}]*"tagName":"header"/.test(markup) && !/"tagName":"header"[^}]*"slug":"header"/.test(markup)) fail(`${label}: header part must use tagName header`);
    if (!/"slug":"footer"[^}]*"tagName":"footer"/.test(markup) && !/"tagName":"footer"[^}]*"slug":"footer"/.test(markup)) fail(`${label}: footer part must use tagName footer`);
    if (/<script[\s>]|\sstyle=|<\?php|\bon[a-z]+=/i.test(markup)) fail(`${label}: contains script, inline style, PHP, or an event handler`);
    if (/<!--\s*wp:html\b/.test(markup)) fail(`${label}: wp:html block is not allowed in templates`);
  }
  // Only a template may own <main>; parts must not, and the header/footer parts keep semantic tags.
  for (const file of list(parts, '.html')) {
    const markup = expandPatterns(read(join(parts, file)));
    const label = `parts/${file}`;
    if (!balanced(markup)) fail(`${label}: block comments are unbalanced`);
    if (/<main[\s>]/.test(markup)) fail(`${label}: a part must not contain <main>`);
    if (/<script[\s>]|<\?php|\bon[a-z]+=/i.test(markup)) fail(`${label}: contains script, PHP, or an event handler`);
    if (/<h1[\s>]|"level":1\b/.test(markup)) fail(`${label}: a part must not own the page h1`);
    if (/wp:navigation\b/.test(markup)) {
      const navs = [...markup.matchAll(/<!--\s*wp:navigation\s*(\{[^]*?\})?\s*\/?-->/g)];
      for (const n of navs) if (!/"ariaLabel"/.test(n[1] ?? '')) fail(`${label}: every navigation block needs an ariaLabel`);
    }
  }
  // A part referenced with tagName X must not wrap itself in <X> again: nested header/footer
  // elements give two banner or contentinfo landmarks.
  for (const slug of ['header', 'footer']) {
    if (has(parts, slug) && new RegExp(`<${slug}[\\s>]`).test(read(join(parts, `${slug}.html`))) && templateFiles.some((f) => new RegExp(`"slug":"${slug}"[^}]*"tagName":"${slug}"`).test(read(join(templates, f))))) {
      fail(`parts/${slug}.html: contains <${slug}> but templates already reference it with tagName ${slug} (nested landmark)`);
    }
  }
  if (has(parts, 'header') && !/wp:navigation\b|wp:page-list\b/.test(expandPatterns(read(join(parts, 'header.html'))))) fail('parts/header.html: no navigation block');

  // Translations: PHP strings use the Base text domain; none dynamic.
  for (const file of list(theme, '.php').filter((f) => !f.includes('node_modules'))) {
    const code = read(join(theme, file));
    for (const m of code.matchAll(/\b(?:__|_e|_x|_n|esc_html__|esc_attr__|esc_html_e|esc_attr_e|_nx)\(\s*(?:'[^']*'|"[^"]*")(?:\s*,\s*(?:'[^']*'|"[^"]*"|\d+|\$\w+))*?\s*,\s*([^,)]+?)\s*\)/g)) {
      if (m[1].replace(/['"]/g, '') !== TEXT_DOMAIN) fail(`${file}: translation call uses text domain ${m[1]}; expected '${TEXT_DOMAIN}'`);
    }
  }
  return failures;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const theme = resolve(process.argv[2] ?? join(import.meta.dirname, '../../themes/blixis-base'));
  const failures = checkTheme(theme);
  for (const f of failures) console.log(`FAIL ${f}`);
  console.log(failures.length ? `RESULT: ${failures.length} static check(s) failed` : 'PASS static template checks');
  process.exit(failures.length ? 1 : 0);
}
