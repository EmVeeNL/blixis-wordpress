// Asserts the CSS-first contract the architecture depends on.
import { readFileSync } from "node:fs";

const css = readFileSync("dist-css/output.css", "utf8");
const checks = {
  "@theme utility generated (.bg-brand)": /\.bg-brand\b/.test(css),
  "@theme spacing utility generated (.p-gutter)": /\.p-gutter\b/.test(css),
  "custom breakpoint variant generated (tablet:flex)": /tablet\\:flex/.test(css),
  "motion-reduce variant generated": /motion-reduce\\:transition-none/.test(css),
  "runtime custom property survives build": css.includes("--blixis-color-brand"),
  "unused utility absent (.bg-red-500)": !/\.bg-red-500\b/.test(css),
};
let failed = 0;
for (const [name, ok] of Object.entries(checks)) {
  console.log(`${ok ? "pass" : "FAIL"} ${name}`);
  failed += ok ? 0 : 1;
}
console.log(`node ${process.version}, output ${css.length} bytes`);
process.exit(failed ? 1 : 0);
