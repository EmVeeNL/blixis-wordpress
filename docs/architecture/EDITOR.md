# Blixis Blocks editor

**Status: planned.** The current plugin has an entry point but no editor interface or persistence.

The top bar shows page identity, undo/redo, viewport, status, preview, save draft, review, and explicit publish. The left side holds the searchable element library and layer tree; the center holds the canvas and insertion feedback; the right inspector always offers a Page tab and offers Element and History when relevant. Element controls are Content, Style, Responsive, and Advanced. Page controls cover WordPress title, slug, status, excerpt, author, visibility, and approved SEO fields; SEO plugin data requires an explicit adapter.

An element manifest must declare a unique type and icon ID, version, schema/defaults, parent/child restrictions, responsive support, inspector controls, renderer, migrations, and free/premium tier. The server validates the same constraints as the editor. Build-time icon imports require license review. No icon name or Tailwind class is generated from arbitrary user input.

The canvas needs pointer and keyboard move paths, valid nesting checks, focus restoration, Escape cancellation, and undoable destructive actions. Selection in tree and canvas must agree. The mobile-first resolver inherits the nearest defined breakpoint value; changing preview width alone does not alter stored overrides.

Content review states (draft, ready for review, changes requested, approved, published) are distinct from roadmap task statuses. MVP preview uses logged-in WordPress permissions. External review links require a separate decision and security work. Unknown element versions must remain in storage without silent loss.
