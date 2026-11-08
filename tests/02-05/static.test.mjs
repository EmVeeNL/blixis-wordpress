// Negative controls: each static rule must be able to fail, and a clean child must pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { Buffer } from 'node:buffer';
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
test('credential fails', () => hit(run({ 'functions.php': '<?php $api_key = "abcdef0123456789abcdef";' }), /credential/)); // gitleaks:allow -- deliberately fake negative-control credential, never used for authentication.
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

// Base's own admin screenshot is the single permitted Base binary.
const png = (w, h, tag = 0) => { const b = Buffer.alloc(32); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(b); b.writeUInt32BE(13, 8); b.write('IHDR', 12); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); b[28] = tag; return b; };
const withBase = (shot, rights) => { const c = make({ 'demo-showcase/style.css': CSS, 'demo-showcase/screenshot.png': png(1200, 900, 7) }); const b = make({ ...BASE, 'screenshot.png': shot }); const r = checkChild(join(c, 'demo-showcase'), b, rights); rmSync(c, { recursive: true }); rmSync(b, { recursive: true }); return r.filter((m) => /Base/.test(m)); };
const RIGHTS_BASE = { dir: null, readme: 'logo.webp screenshot.png themes/blixis-base/screenshot.png' };
test('Base 1200x900 screenshot with a rights entry passes', () => assert.deepEqual(withBase(png(1200, 900, 1), RIGHTS_BASE), []));
test('Base screenshot of the wrong size fails', () => hit(withBase(png(1280, 800, 1), RIGHTS_BASE), /1200×900/));
test('Base screenshot without a rights entry fails', () => hit(withBase(png(1200, 900, 1), { dir: null, readme: 'screenshot.png' }), /no rights entry/));
test('Base screenshot that copies the concept image fails', () => {
  const dir = make({ 'blixis-base-preview.png': png(1200, 900, 1) });
  hit(withBase(png(1200, 900, 1), { dir, readme: RIGHTS_BASE.readme + ' blixis-base-preview.png' }), /duplicates/);
});
test('Base screenshot that copies the child screenshot fails', () => hit(withBase(png(1200, 900, 7), RIGHTS_BASE), /duplicates/));
test('any other Base binary still fails', () => hit(run({}, { ...BASE, 'assets/screenshot.png': 'x' }), /binary asset/));
