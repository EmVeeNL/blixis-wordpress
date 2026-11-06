# Editor plan

The plugin currently registers with WordPress but exposes no editor. Implement the first usable element end to end before adding an editor route: schema, capabilities, save/load, server rendering, accessibility, and tests.

The editor will have a registry of element definitions, responsive properties, icons, selection, context menus, drawers, page settings, drag and drop, history, autosave, previews, and review states. Keep persistence in the WordPress REST API and sanitize/validate on the server. Preserve unknown versioned content for migration rather than silently discarding it. Use portable React and WordPress APIs.
