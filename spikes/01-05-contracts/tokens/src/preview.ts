// Admin preview proof: real React 18.3.1 renders the same contract as render.php.
// React is resolved from the 01-02 package because this spike adds no dependencies.
import { createRequire } from "node:module";
import { join } from "node:path";
import { FRONTEND } from "./contract.ts";
import { type Diagnostic, type Node, isSafeUrl, resolveNode, sortDiagnostics } from "./resolve.ts";

type Props = Record<string, unknown>;
type ReactLike = { createElement: (tag: string, props: Props, child?: string) => unknown };
type ServerLike = { renderToStaticMarkup: (element: unknown) => string };

const require = createRequire(join(FRONTEND, "package.json"));
const react = require("react") as ReactLike;
const server = require("react-dom/server") as ServerLike;

export type Media = Record<string, { url: string; width: number; height: number }>;

export function renderPreview(
  node: Node,
  media: Media,
): { html: string; diagnostics: Diagnostic[] } {
  const { resolved, diagnostics } = resolveNode(node);
  const done = (element: unknown): { html: string; diagnostics: Diagnostic[] } => ({
    html: element === null ? "" : server.renderToStaticMarkup(element),
    diagnostics: sortDiagnostics(diagnostics),
  });
  if (resolved === null) return done(null);
  const { values, classes } = resolved;
  const type = node.type as string;
  if (type === "blixis/heading" || type === "blixis/paragraph") {
    const text = values["text"] as string;
    if (text === "") {
      diagnostics.push({ code: "render.empty_content", path: "/props/text" });
      return done(null);
    }
    const tag = type === "blixis/heading" ? `h${values["level"] as number}` : "p";
    return done(react.createElement(tag, { className: classes }, text));
  }
  if (type === "blixis/button") {
    const label = values["label"] as string;
    if (label === "") {
      diagnostics.push({ code: "render.empty_content", path: "/props/label" });
      return done(null);
    }
    const url = values["url"] as string;
    if (url !== "" && isSafeUrl(url)) {
      return done(react.createElement("a", { className: classes, href: url }, label));
    }
    if (url !== "") diagnostics.push({ code: "render.unsafe_url", path: "/props/url" });
    return done(react.createElement("span", { className: classes }, label));
  }
  const id = values["mediaId"];
  const item = typeof id === "number" ? media[String(id)] : undefined;
  if (item === undefined) {
    diagnostics.push({ code: "render.media_missing", path: "/props/mediaId" });
    return done(null);
  }
  if (!isSafeUrl(item.url)) {
    diagnostics.push({ code: "render.unsafe_url", path: "/props/mediaId" });
    return done(null);
  }
  return done(
    react.createElement("img", {
      className: classes,
      src: item.url,
      alt: values["alt"],
      width: item.width,
      height: item.height,
      loading: values["loading"],
    }),
  );
}
