// Parses the small HTML subset the renderer emits into a comparable tree. It decodes
// entities, because PHP and React spell the same text differently.
export type HtmlNode = { tag: string; attrs: [string, string][]; children: (HtmlNode | string)[] };

const VOID = new Set(["img", "br"]);

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (_all, body: string) => {
    if (body.startsWith("#x")) return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    if (body.startsWith("#")) return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    return named[body] ?? "";
  });
}

export function parseHtml(html: string): (HtmlNode | string)[] {
  const root: HtmlNode = { tag: "#root", attrs: [], children: [] };
  const stack = [root];
  const token = /<\/([a-z0-9]+)>|<([a-z0-9]+)((?:\s+[a-z-]+(?:="[^"]*")?)*)\s*\/?>|([^<]+)|(<)/gy;
  for (const match of html.matchAll(token)) {
    const top = stack.at(-1) as HtmlNode;
    if (match[1] !== undefined) {
      if (top.tag !== match[1]) throw new Error(`Mismatched </${match[1]}> in ${html}`);
      stack.pop();
    } else if (match[2] !== undefined) {
      const attrs: [string, string][] = [];
      for (const attr of (match[3] ?? "").matchAll(/([a-z-]+)(?:="([^"]*)")?/g)) {
        attrs.push([attr[1] ?? "", decodeEntities(attr[2] ?? "")]);
      }
      attrs.sort((a, b) => (a[0] < b[0] ? -1 : 1));
      const node: HtmlNode = { tag: match[2], attrs, children: [] };
      top.children.push(node);
      if (!VOID.has(match[2])) stack.push(node);
    } else if (match[4] !== undefined) {
      top.children.push(decodeEntities(match[4]));
    } else {
      throw new Error(`Stray < in ${html}`);
    }
  }
  if (stack.length !== 1) throw new Error(`Unclosed element in ${html}`);
  return root.children;
}
