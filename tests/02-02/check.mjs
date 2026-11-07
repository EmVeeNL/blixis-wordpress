import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const asset = 'themes/blixis-base/assets/build/tailwind.css';
const fullPath = resolve(root, asset);
const mapPath = `${fullPath}.map`;
const source = readFileSync(resolve(root, 'themes/blixis-base/assets/src/tailwind.css'), 'utf8');
const golden = readFileSync(resolve(root, 'docs/contracts/tokens/v1/golden/tailwind.css'), 'utf8');
assert.equal(source.slice(source.indexOf('@theme')), golden.slice(golden.indexOf('@theme')), 'token names and fixed breakpoints must match the accepted contract');
assert.ok(source.includes('@import "tailwindcss/utilities.css" source(none);'), 'only utilities with automatic scanning disabled may be imported');
assert.deepEqual([...source.matchAll(/@source "([^"]+)";/g)].map((match) => match[1]), ['../../templates', '../../parts', '../../patterns', './safelist.html'], 'sources must remain explicitly reviewed');
const pkg = JSON.parse(readFileSync(resolve(root, 'themes/blixis-base/package.json'), 'utf8'));
assert.deepEqual(pkg.devDependencies, { '@tailwindcss/cli': '4.3.5', tailwindcss: '4.3.5' }, 'Tailwind compiler and runtime must remain exactly pinned');

assert.ok(existsSync(fullPath), 'production CSS asset must exist');
assert.ok(!existsSync(mapPath), 'production source map must not be shipped');

const css = readFileSync(fullPath, 'utf8');
const bytes = Buffer.byteLength(css);
assert.ok(bytes > 0 && bytes <= 40 * 1024, `CSS bundle must be 1–40 KiB; got ${bytes} bytes`);
assert.ok(!css.includes('sourceMappingURL='), 'production CSS must not link to a source map');

for (const selector of [
  '.bg-surface',
  '.text-foreground',
  '.text-primary',
  '.sm\\:grid-cols-2',
  '.motion-reduce\\:transition-none',
]) {
  assert.ok(css.includes(selector), `expected utility selector missing: ${selector}`);
}

assert.ok(css.includes('prefers-reduced-motion'), 'reduced-motion variant must use a media query');
assert.ok(css.includes('--blixis-color-primary'), 'runtime token mapping must remain in compiled CSS');
assert.ok(!css.includes('javascript:alert'), 'untrusted arbitrary utility must not compile');
assert.ok(!/@layer\b/.test(css), 'utilities must remain unlayered');
assert.ok(css.includes('min-width:40rem'), 'sm breakpoint must remain a literal build input');
assert.ok(!css.includes('box-sizing:border-box'), 'Tailwind preflight must not be bundled');

execFileSync('git', ['ls-files', '--error-unmatch', asset], { cwd: root, stdio: 'ignore' });
execFileSync('git', ['diff', '--exit-code', '--', asset], { cwd: root, stdio: 'ignore' });

console.log(`02-02 CSS checks passed (${bytes} bytes; committed asset matches build)`);

// A file adjacent to the approved sources must not enter automatic scanning.
const excluded = resolve(root, 'themes/blixis-base/assets/untrusted-scan-probe.html');
assert.ok(!existsSync(excluded), 'probe must not overwrite a local file');
try {
  writeFileSync(excluded, '<div class="z-[98765] bg-[url(javascript:alert(1))]"></div>');
  execFileSync('pnpm', ['--filter', 'blixis-base-theme', 'build'], { cwd: root, stdio: 'pipe' });
  assert.equal(readFileSync(fullPath, 'utf8'), css, 'unapproved sources changed the build');
} finally {
  unlinkSync(excluded);
}
console.log('02-02 negative source scan and repeat-build determinism passed');
