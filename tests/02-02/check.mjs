import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const asset = 'themes/blixis-base/assets/build/tailwind.css';
const fullPath = resolve(root, asset);
const mapPath = `${fullPath}.map`;

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
assert.ok(!css.includes('box-sizing:border-box'), 'Tailwind preflight must not be bundled');

execFileSync('git', ['ls-files', '--error-unmatch', asset], { cwd: root, stdio: 'ignore' });
execFileSync('git', ['diff', '--exit-code', '--', asset], { cwd: root, stdio: 'ignore' });

console.log(`02-02 CSS checks passed (${bytes} bytes; committed asset matches build)`);
