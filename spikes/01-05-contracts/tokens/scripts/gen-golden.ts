// Writes goldens from the PHP generator, the declared single generator. Review the diff
// before committing: a changed golden is a contract change.
// Run with: node tokens/scripts/gen-golden.ts (from spikes/01-05-contracts).
import { Buffer } from "node:buffer";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONTRACT, readFixtureBytes } from "../src/contract.ts";
import { runPhp } from "../src/php.ts";
import { tailwindThemeCss } from "../src/tailwind.ts";

type Row = { css: string; themeJson: string; hash: string; cssKey: string; canonical: string };
const names = ["default", "generic-fonts"];
const rows = runPhp<Row[]>(
  "validate",
  names.map((name) => Buffer.from(readFixtureBytes("valid", `${name}.json`)).toString("base64")),
);
names.forEach((name, index) => {
  const row = rows[index] as Row;
  writeFileSync(join(CONTRACT, "golden", `${name}.tokens.css`), row.css);
  writeFileSync(
    join(CONTRACT, "golden", `${name}.theme.json`),
    `${JSON.stringify(JSON.parse(row.themeJson), null, 2)}\n`,
  );
});
writeFileSync(join(CONTRACT, "golden", "tailwind.css"), tailwindThemeCss());
const base = {
  postId: 7,
  documentHash: "0a1b2c3d4e5f6071",
  rendererVersion: 1,
  registryHash: "a1b2c3d4",
  status: "publish",
  hasPassword: false,
  configHash: (rows[0] as Row).hash,
};
const inputs: Record<string, typeof base> = {
  published: base,
  "document-changed": { ...base, documentHash: "1b2c3d4e5f607182" },
  "renderer-version-changed": { ...base, rendererVersion: 2 },
  "registry-changed": { ...base, registryHash: "e5f6a7b8" },
  "config-changed": { ...base, configHash: (rows[1] as Row).hash },
  draft: { ...base, status: "draft" },
  private: { ...base, status: "private" },
  pending: { ...base, status: "pending" },
  future: { ...base, status: "future" },
  "password-protected": { ...base, hasPassword: true },
};
const keys = runPhp<{ fragment: string | null; page: string | null }[]>(
  "cache-keys",
  Object.values(inputs),
);
const cases = Object.entries(inputs).map(([name, input], index) => ({
  name,
  input,
  ...(keys[index] as object),
}));
writeFileSync(
  join(CONTRACT, "golden", "cache-keys.json"),
  `${JSON.stringify({ css: { default: (rows[0] as Row).cssKey, hash: (rows[0] as Row).hash, canonical: (rows[0] as Row).canonical }, render: cases }, null, 2)}\n`,
);
console.log("goldens written");
