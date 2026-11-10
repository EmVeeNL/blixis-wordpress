// Regenerates plugins/blixis-blocks/inc/child-theme/layouts/{business,portfolio,blog,landing}.php.
//
// The layouts are block markup that core must accept without recovery. Hand-written markup drifts
// from what the blocks serialize, so the markup is built here with wp.blocks.createBlock and
// wp.blocks.serialize in a real block editor, which makes every block valid by construction.
// Text is replaced by placeholders while building and mapped back to translation calls.
//
// Run against the disposable stack (the editor needs a signed-in administrator):
//   T0307_SERIALIZE=1 tests/03-07/run.sh --out DIR --browsers chromium "7.1.4 8.3"
// then copy DIR/layouts/*.php over plugins/blixis-blocks/inc/child-theme/layouts/.
// The validity check in browser.mjs fails if a committed file drifts from the editor.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const out = `${process.env.T0307_OUT || '/work/shots'}/layouts`;
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('http://127.0.0.1:8080/wp-login.php', { waitUntil: 'networkidle' });
await page.locator('#user_login').fill('fixture_admin');
await page.locator('#user_pass').fill(process.env.T0307_ADMIN_PASSWORD);
await page.locator('#wp-submit').click();
await page.goto('http://127.0.0.1:8080/wp-admin/post-new.php', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.wp?.blocks?.createBlock && window.wp.blocks.getBlockTypes().some((type) => type.name === 'core/details'));

const built = await page.evaluate(() => {
  const { createBlock, serialize } = wp.blocks;
  const texts = [];
  const t = (text) => { texts.push(text); return `@@T${texts.length - 1}@@`; };
  const b = (name, attributes = {}, inner = []) => createBlock(name, attributes, inner);

  const SP = (slug) => `var:preset|spacing|${slug}`;
  const BLEED = 'calc(-1 * var(--blixis-spacing-md, 1rem))';
  // Spacing is block attributes, so it serializes to inline styles and Base needs no layout CSS.
  const section = (attrs, inner) => {
    const { style = {}, ...rest } = attrs;
    const spacing = style.spacing || {};
    return b('core/group', { tagName: 'section', layout: { type: 'constrained' }, ...rest, style: { ...style, spacing: { ...spacing, padding: { top: SP('xl'), bottom: SP('xl'), ...(spacing.padding || {}) } } } }, inner);
  };
  // A band crosses Base's root gutter with negative margins and gives its content the gutter back.
  const band = (attrs, inner) => {
    const { style = {}, ...rest } = attrs;
    const spacing = style.spacing || {};
    return section({ align: 'full', ...rest, style: { ...style, spacing: { ...spacing, padding: { left: SP('md'), right: SP('md'), ...(spacing.padding || {}) }, margin: { left: BLEED, right: BLEED } } } }, inner);
  };
  const h = (level, text, attrs = {}) => b('core/heading', { level, content: t(text), ...attrs });
  const p = (text, attrs = {}) => b('core/paragraph', { content: t(text), ...attrs });
  const button = (text, url, attrs = {}) => b('core/button', { text: t(text), url, ...attrs });
  const buttons = (...inner) => b('core/buttons', {}, inner);
  const card = (inner, attrs = {}) => b('core/group', { ...attrs, backgroundColor: 'surface', style: { border: { width: '1px', style: 'solid', color: 'var:preset|color|muted', radius: 'var:preset|border-radius|md' }, shadow: 'var:preset|shadow|md', spacing: { padding: { top: SP('lg'), bottom: SP('lg'), left: SP('lg'), right: SP('lg') } } }, layout: { type: 'constrained' } }, inner);
  const grid = (inner) => b('core/group', { align: 'wide', layout: { type: 'grid', minimumColumnWidth: 'min(100%, 22rem)' }, style: { spacing: { blockGap: SP('lg') } } }, inner);
  const intro = (eyebrow, title, lead) => section({ style: { spacing: { padding: { bottom: SP('lg') } } } }, [p(eyebrow, { textColor: 'primary' }), h(1, title), p(lead, { fontSize: 'xl' })]);

  const layouts = {};

  layouts.business = {
    title: 'Business home', description: 'A complete neutral business homepage.',
    blocks: [
      band({ backgroundColor: 'primary', textColor: 'surface' }, [
        h(1, 'A better way to do business', { textColor: 'surface', fontSize: '3xl' }),
        p('Thoughtful services, clear expertise, and a team ready to help you move forward.', { fontSize: 'xl' }),
        buttons(button('Start a conversation', '#contact', { backgroundColor: 'surface', textColor: 'primary' }), button('Explore our services', '#features', { className: 'is-style-outline', textColor: 'surface', borderColor: 'surface' })),
      ]),
      section({ anchor: 'features' }, [
        h(2, 'What we bring to the table'),
        grid([
          card([h(3, 'Clear strategy'), p('A practical plan shaped around your goals and your customers.')], { className: 'business-feature-card' }),
          card([h(3, 'Careful craft'), p('Reliable delivery with attention to the details that matter.')], { className: 'business-feature-card' }),
          card([h(3, 'Lasting support'), p('A dependable partner as your business continues to grow.')], { className: 'business-feature-card' }),
        ]),
      ]),
      band({ backgroundColor: 'foreground', textColor: 'surface' }, [
        h(2, 'Ready to start?', { textColor: 'surface' }),
        p('Let us make your next step a confident one.'),
        buttons(button('Talk with our team', '#contact')),
      ]),
      section({ anchor: 'contact' }, [
        h(2, 'Contact'),
        p('Tell us a little about your project and we will be in touch.'),
        b('core/paragraph', { content: `<a href="mailto:hello@example.test">${t('hello@example.test')}</a>` }),
      ]),
    ],
  };

  layouts.portfolio = {
    title: 'Portfolio home', description: 'A six-project portfolio grid.',
    blocks: [
      intro('Selected work · 2022—2026', 'Ideas made tangible', 'A collection of collaborations, experiments, and useful things made with care.'),
      section({ anchor: 'projects' }, [
        h(2, 'Selected projects'),
        grid([1, 2, 3, 4, 5, 6].map((n) => card([p(`Category ${n}`, { textColor: 'primary' }), h(3, `Project ${n}`), p('A short note about the challenge, approach, and result of this work.')]))),
      ]),
    ],
  };

  const postCard = (level, excerpt) => card([b('core/post-date'), b('core/post-title', { isLink: true, level }), b('core/post-excerpt', excerpt)]);
  const noResults = (text) => b('core/query-no-results', {}, [p(text)]);
  const query = (queryId, query, inner) => b('core/query', { queryId, query: { perPage: 1, pages: 0, offset: 0, postType: 'post', order: 'desc', orderBy: 'date', inherit: false, ...query } }, inner);
  layouts.blog = {
    title: 'Blog home', description: 'A featured post and latest posts.',
    blocks: [
      intro('Notes & perspectives', 'The journal', 'Ideas, observations, and stories from our work.'),
      section({ style: { spacing: { padding: { top: SP('md') } } } }, [
        h(2, 'Featured story'),
        query(1, { perPage: 1 }, [b('core/post-template', {}, [postCard(3, { moreText: t('Read the story') })]), noResults('No posts yet. Check back soon for the latest stories.')]),
      ]),
      section({}, [
        h(2, 'Latest posts'),
        query(2, { perPage: 6, offset: 1 }, [b('core/post-template', { layout: { type: 'grid', columnCount: 3 } }, [postCard(3, { excerptLength: 18 })]), noResults('No more posts to show.')]),
      ]),
    ],
  };

  const faq = (question, answer) => b('core/group', { style: { border: { width: '1px', style: 'solid', color: 'var:preset|color|muted', radius: 'var:preset|border-radius|md' }, spacing: { padding: { top: SP('md'), bottom: SP('md'), left: SP('md'), right: SP('md') }, blockGap: SP('sm') } }, layout: { type: 'constrained' } }, [b('core/details', { summary: t(question) }, [p(answer)])]);
  layouts.landing = {
    title: 'Landing page', description: 'A one-page layout with anchored sections and FAQs.',
    blocks: [
      band({ backgroundColor: 'primary', textColor: 'surface' }, [
        h(1, 'Make room for your next big idea', { textColor: 'surface' }),
        p('A focused partner for turning meaningful plans into real progress.', { fontSize: 'xl' }),
        buttons(button('Get started', '#contact', { backgroundColor: 'surface', textColor: 'primary' })),
      ]),
      band({ tagName: 'div', style: { spacing: { padding: { top: SP('md'), bottom: SP('md') } } } }, [
        b('core/navigation', { ariaLabel: t('On this page'), overlayMenu: 'never', className: 'landing-page-navigation' }, [
          ['Overview', '#overview'], ['Approach', '#approach'], ['FAQ', '#faq'], ['Contact', '#contact'],
        ].map(([label, url]) => b('core/navigation-link', { label: t(label), url, kind: 'custom' }))),
      ]),
      band({ anchor: 'overview' }, [h(2, 'A clear path from idea to impact'), p('We bring structure, momentum, and thoughtful expertise to the work that matters most.')]),
      band({ anchor: 'approach', style: { border: { top: { width: '1px', style: 'solid', color: 'var:preset|color|muted' }, bottom: { width: '1px', style: 'solid', color: 'var:preset|color|muted' } } } }, [h(2, 'A practical, human approach'), p('Start with what you know, learn from the people you serve, and improve with every step.')]),
      band({ anchor: 'faq' }, [
        h(2, 'Frequently asked questions'),
        faq('Who is this for?', 'For people and teams ready to make useful progress.'),
        faq('How do we begin?', 'We start with a short conversation about your goals.'),
        faq('What happens next?', 'You get a clear proposal with practical next steps.'),
      ]),
      band({ anchor: 'contact', backgroundColor: 'foreground', textColor: 'surface' }, [
        h(2, 'Let’s make it happen', { textColor: 'surface' }),
        p('Tell us what you have in mind. We would love to hear from you.'),
        buttons(button('Contact us', 'mailto:hello@example.test')),
      ]),
    ],
  };

  return { texts, layouts: Object.fromEntries(Object.entries(layouts).map(([name, layout]) => [name, { title: layout.title, description: layout.description, content: serialize(layout.blocks) }])) };
});

const php = (text) => text.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
const flags = 'JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT';
for (const [name, layout] of Object.entries(built.layouts)) {
  let body = layout.content;
  body = body.replace(/"@@T(\d+)@@"/g, (_m, i) => `<?php echo wp_json_encode( __( '${php(built.texts[i])}', '{{domain}}' ), ${flags} ); ?>`);
  body = body.replace(/@@T(\d+)@@/g, (_m, i) => `<?php esc_html_e( '${php(built.texts[i])}', '{{domain}}' ); ?>`);
  const header = `<?php\n/**\n * Title: ${layout.title}\n * Slug: {{domain}}/${name}\n * Categories: featured\n * Description: ${layout.description}\n *\n * Generated by tests/03-07/serialize-layouts.mjs: do not edit by hand.\n */\n?>\n`;
  await writeFile(`${out}/${name}.php`, `${header}${body}\n`);
  console.log(`NOTE wrote ${name}.php (${body.length} bytes)`);
}
await browser.close();
console.log('DONE-BROWSER 0');
