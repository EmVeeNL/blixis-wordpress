// Negative controls for static.mjs: a good tree passes; each mutation must fail for its reason.
// Run: node --test tests/02-04/static.test.mjs
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkTheme } from './static.mjs';

const header = '<!-- wp:group {"tagName":"header"} --><div class="wp-block-group"><!-- wp:navigation {"ariaLabel":"Primary"} /--></div><!-- /wp:group -->';
const footer = '<!-- wp:group {"tagName":"footer"} --><div class="wp-block-group"></div><!-- /wp:group -->';
const shell = (body) => `<!-- wp:template-part {"slug":"header","tagName":"header"} /-->\n<!-- wp:group {"tagName":"main"} --><main class="wp-block-group">${body}</main><!-- /wp:group -->\n<!-- wp:template-part {"slug":"footer","tagName":"footer"} /-->`;
const good = () => ({
  'parts/header.html': header,
  'parts/footer.html': footer,
  'templates/index.html': shell('<!-- wp:query-title {"type":"archive"} /-->'),
  'templates/singular.html': shell('<!-- wp:post-title {"level":1} /--><!-- wp:post-content /-->'),
  'templates/archive.html': shell('<!-- wp:query-title {"type":"archive"} /-->'),
  'templates/search.html': shell('<!-- wp:query-title {"type":"search"} /-->'),
  'templates/404.html': shell('<!-- wp:heading {"level":1} --><h1 class="wp-block-heading">Not found</h1><!-- /wp:heading -->'),
  'functions.php': "<?php\n$x = esc_html__( 'Hello', 'blixis-base' );\n",
});
const build = (mutate = () => {}) => {
  const dir = mkdtempSync(join(tmpdir(), 't0204-static-'));
  const files = good();
  mutate(files);
  for (const [name, content] of Object.entries(files)) {
    if (content === null) continue;
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
  return dir;
};
const run = (mutate) => {
  const dir = build(mutate);
  try {
    return checkTheme(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test('a conforming tree passes', () => assert.deepEqual(run(), []));
test('missing 404 template fails', () => assert.match(run((f) => (f['templates/404.html'] = null)).join('\n'), /404\.html is missing/));
test('missing footer part fails', () => assert.match(run((f) => (f['parts/footer.html'] = null)).join('\n'), /parts\/footer\.html is missing/));
test('two main elements fail', () => assert.match(run((f) => (f['templates/search.html'] += '<main></main>')).join('\n'), /exactly one <main>/));
test('main inside a part fails', () => assert.match(run((f) => (f['parts/header.html'] += '<main></main>')).join('\n'), /must not contain <main>/));
test('unlabelled navigation fails', () => assert.match(run((f) => (f['parts/header.html'] = header.replace('{"ariaLabel":"Primary"}', ''))).join('\n'), /needs an ariaLabel/));
test('nested header element fails', () => {
  const nested = header.replace('<div class="wp-block-group">', '<header class="wp-block-group">').replace('</div><!-- /wp:group -->', '</header><!-- /wp:group -->');
  assert.match(run((f) => (f['parts/header.html'] = nested)).join('\n'), /nested landmark/);
});
test('h1 supplied by a pattern is counted', () => assert.deepEqual(run((f) => { f['templates/404.html'] = shell('<!-- wp:pattern {"slug":"blixis-base/not-found"} /-->'); f['patterns/not-found.php'] = '<?php\n// x\n?>\n<!-- wp:heading {"level":1} --><h1 class="wp-block-heading">x</h1><!-- /wp:heading -->'; }), []));
test('wrong header tag fails', () => assert.match(run((f) => (f['templates/index.html'] = f['templates/index.html'].replace('"tagName":"header"', '"tagName":"div"'))).join('\n'), /tagName header/));
test('duplicate h1 source fails', () => assert.match(run((f) => (f['templates/singular.html'] += '<h1>x</h1>')).join('\n'), /exactly one h1 source/));
test('foreign text domain fails', () => assert.match(run((f) => (f['functions.php'] += "$y = __( 'x', 'other' );\n")).join('\n'), /text domain 'other'|text domain other/));
test('unbalanced block comment fails', () => assert.match(run((f) => (f['templates/archive.html'] += '<!-- wp:group -->')).join('\n'), /unbalanced/));
