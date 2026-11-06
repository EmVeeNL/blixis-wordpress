// Runs php/cli.php with a JSON array on stdin.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { SPIKE_TOKENS } from "./contract.ts";

export function runPhp<T>(command: string, input: unknown): T {
  const result = spawnSync("php", [join(SPIKE_TOKENS, "php/cli.php"), command], {
    input: JSON.stringify(input),
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error(`php exited ${result.status}: ${result.stderr}${result.stdout.slice(0, 500)}`);
  return JSON.parse(result.stdout) as T;
}
