// Negative controls: each static rule must be able to fail, and a clean child must pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkChild, discoverChild } from './static.mjs';

const make = (files) => {
  const root = mkdtempSync(join(tmpdir(), 't0205-'));
  for (const [rel, body] of Object.entries(files)) { mkdirSync(join(root, rel, '..'), { recursive: true }); writeFileSync(join(root, rel), body); }
  return root;
};
const CSS = '/*\nTheme Name: Demo Showcase\nTemplate: blixis-base\nVersion: 0.1.0\nLicense: GPL-2.0-or-later\nText Domain: demo-showcase\n*/\n';
const BASE = { 'style.css': '/*\nTheme Name: Blixis Base\nText Domain: blixis-base\n*/', 'templates/index.html': '<!-- wp:post-content /-->' };
const RIGHTS = { dir: null, readme: 'logo.webp' };
const run = (child, base = BASE) => { const c = make({ 'demo-showcase/style.css': CSS, ...Object.fromEntries(Object.entries(child).map(([k, v]) => ['demo-showcase/' + k, v])) }); const b = make(BASE === base ? base : base); const r = checkChild(join(c, 'demo-showcase'), b, RIGHTS); rmSync(c, { recursive: true }); rmSync(b, { recursive: true }); return r; };
const hit = (r, re) => assert.ok(r.some((m) => re.test(m)), r.join('\n') || 'no failures');

test('clean child passes', () => assert.deepEqual(run({ 'templates/front-page.html': '<!-- wp:post-content /-->' }), []));
test('wrong parent fails', () => { const c = make({ 'x/style.css': CSS.replace('blixis-base', 'other') }); hit(checkChild(join(c, 'x'), make(BASE), RIGHTS), /Template/); });
test('text domain must match directory', () => { const c = make({ 'demo-showcase/style.css': CSS.replace('Text Domain: demo-showcase', 'Text Domain: nope') }); hit(checkChild(join(c, 'demo-showcase'), make(BASE), RIGHTS), /Text Domain/); });
test('external stylesheet fails', () => hit(run({ 'templates/a.html': '<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=X">' }), /external resource/));
test('remote @import fails', () => hit(run({ 'a.css': '@import url("https://cdn.example.org/a.css");' }), /@import|external/));
test('inline script fails', () => hit(run({ 'templates/a.html': '<script>1</script>' }), /inline script/));
test('credential fails', () => hit(run({ 'functions.php': '<?php $api_key = "abcdef0123456789abcdef";' }), /credential/));
test('unimplemented claim fails, hedged claim passes', () => {
  hit(run({ 'patterns/a.php': '<?php // x\n?><p>Build with our drag and drop page builder.</p>' }), /unimplemented/);
  assert.deepEqual(run({ 'patterns/a.php': '<?php // x\n?><p>A drag and drop editor is planned for a later release.</p>' }), []);
});
test('img without alt fails', () => hit(run({ 'templates/a.html': '<img src="a.png">' }), /without alt/));
test('binary without rights entry fails', () => hit(run({ 'assets/pic.png': 'x' }), /rights entry/));
test('Base mentioning the child fails', () => hit(run({}, { ...BASE, 'templates/index.html': 'Demo Showcase' }), /mentions the child/));
test('Base shipping an image fails', () => hit(run({}, { ...BASE, 'assets/a.png': 'x' }), /binary asset/));
test('invalid theme.json fails', () => hit(run({ 'theme.json': '{' }), /theme.json/));
test('discovery finds the child by Template header', () => { const r = make({ 'blixis-base/style.css': 'Template: x', 'zz/style.css': CSS }); assert.equal(discoverChild(r), join(r, 'zz')); });
