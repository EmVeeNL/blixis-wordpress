// Conceptual contract; registry types are not implemented yet.
export const headingElement = {
  type: 'blixis/heading',
  version: 1,
  displayName: 'Heading',
  category: 'typography',
  icon: 'tabler:heading', // Must be unique in registry; license review required
  tier: 'free',
  defaultProps: { text: 'New heading', level: 2 },
  supports: { responsive: ['fontSize', 'fontWeight', 'align', 'color', 'margin'], visibility: true },
  allowedParents: ['blixis/section', 'blixis/container', 'blixis/column'],
  allowedChildren: [],
  inspector: { tabs: ['content', 'style', 'responsive', 'advanced'] },
  specVersion: 1,
  // Schema, renderer, and migrations are required at implementation.
} as const;
