# Blixis Base and child themes

**Implemented:** `themes/blixis-base` is a neutral block parent theme with WordPress 7.0/PHP 8.3 headers, bootstrap hooks, token-aligned default presets, and a singular template that prints published post content. Its Tailwind CSS v4 package compiles CSS-first sources into a committed production stylesheet; WordPress hosts do not need Node. The local installation links the theme but does not activate it. There is no child-theme generator or runtime token editor yet.

**Planned:** A site child theme owns branding, fonts, variants, and overrides. Never write site-specific changes into Base through the setup UI. Later Base template work adds page, single, archive, search, and 404 layouts, header/footer parts, and a skip link. The present singular template and compiled CSS do not claim a full visual or accessibility audit. Base should still load safely when Blocks is inactive.

## Production CSS

The reviewed Tailwind source is `themes/blixis-base/assets/src/tailwind.css`; the deployable output is `themes/blixis-base/assets/build/tailwind.css`. Run `pnpm install --frozen-lockfile && pnpm build` from the repository root after changing a template or the approved static safelist, then commit the regenerated output with the source. CI verifies byte equality with the committed asset, expected utilities, size, and the no-source-map policy. The source scans only known theme files and the static safelist. It never scans stored page content or accepts arbitrary class names from users. New element registry utilities belong to the Blocks package when that package is implemented.

Tailwind supplies unlayered utilities only, without preflight. The parent-owned asset loads after registered WordPress global styles and Base CSS, with a content-hash version. Child themes cannot shadow its public or editor URL. Editor registration covers this compiled file only; it is not a claim of iframe rendering or token parity. A missing build logs and keeps serving in production, and stops front-end requests with a build instruction in other environments. Its `@theme inline` values refer to the future validated `--blixis-*` runtime tokens, while its breakpoint variants are fixed build inputs. See the [token contract](../contracts/tokens/README.md). WordPress global styles and Base's neutral stylesheet remain separate; the runtime token generator and Site Editor precedence are later tasks.

![Blixis concept preview](../assets/blixis-base-preview.png)

The image is a concept illustration, not a capture of a working theme. It belongs to a separate showcase, not every new site's default content. See [token configuration](CONFIGURATION.md) and [theme roadmap](../roadmap/phases/02-blixis-base-theme/_index.md).
