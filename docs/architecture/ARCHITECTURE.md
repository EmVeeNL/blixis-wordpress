# Architecture

The repository owns source and automation; `~/Sites/blixis` owns the WordPress runtime. Its `wp-content/themes/blixis-base` and `wp-content/plugins/blixis-blocks` paths point to this checkout. Core, uploads, and `wp-config.php` remain in the runtime installation. MariaDB data remains in Docker volume `blixis_mariadb_data`.

## Theme decision

Blixis Base is a versioned block parent theme using `theme.json` and WordPress templates. This gives WordPress native global styles, editor controls, and child-theme inheritance. Custom site themes can be child themes with their own `theme.json` and templates. A shared PHP framework would add a second inheritance mechanism before one is needed.

WordPress global styles are the canonical runtime design tokens. Future tooling should derive Tailwind CSS v4 theme variables and editor token types from a single token source, then generate `theme.json`; do not maintain separate hand-edited copies. WordPress font library and font-face declarations will supply fonts. Define responsive breakpoints once in that token source when Tailwind is introduced. Use core semantic blocks and accessible markup.

The current theme is intentionally minimal and is not activated by setup. Child-theme behavior, generated tokens, Tailwind integration, and Blocks integration are roadmap work.

## Plugin boundaries

`blixis-blocks` is an independently versioned plugin. Its future editor UI uses React, TypeScript, Tailwind CSS v4, shadcn/ui, and dnd-kit. Keep element definitions and unique icons in an extensible registry; separate content schema, editor state, server rendering, and persistence. Store versioned portable content; migrate it explicitly. REST endpoints must use WordPress authentication, nonces where appropriate, and capability checks. Draft preview, autosave, undo/redo, review workflows, and premium elements require real implementations before UI is exposed.

The Content API will use its own plugin or module after the access model and schema are defined. It must not expose draft or private content without authorization.

## Packages

Do not create empty workspace packages. Introduce `design-tokens` when token generation is built, `block-schema` when schema validation is used on both client and server, and `shared-ui` only after components are reused. `shared-ui` may depend on `design-tokens` and `block-schema`; neither foundational package may depend on `shared-ui`.
