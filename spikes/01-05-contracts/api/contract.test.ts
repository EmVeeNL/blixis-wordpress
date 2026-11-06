// Offline check of the API contract. The same matrix is run over real HTTP by wp/test.php.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

const here = import.meta.dirname;
const contractDir = join(here, "../../../docs/contracts/api");
const copyDir = join(here, "wp/contract");

type Json = Record<string, unknown>;

interface MatrixCase {
  id: string;
  surface: string;
  actors: string[];
  auths: string[];
  post_states: string[];
  method: string;
  route: string;
  expect: { status: number; code: string };
}

interface Matrix {
  contract_version: string;
  actors: string[];
  post_states: string[];
  cases: MatrixCase[];
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function readJson<T = Json>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

const matrix = readJson<Matrix>(join(contractDir, "authz-matrix.json"));
const errorDir = join(contractDir, "examples/errors");
const errorCodes = readdirSync(errorDir).map((name) => name.replace(/\.json$/, ""));
const statusByCode = new Map(
  errorCodes.map((code) => {
    const body = readJson<{ data: { status: number } }>(join(errorDir, `${code}.json`));
    return [code, body.data.status] as const;
  }),
);
const hiddenStates = [
  "draft",
  "pending",
  "future",
  "private",
  "trash",
  "password",
  "nonexistent",
  "unpublished",
  "auto_draft",
  "revision",
  "attachment",
  "nonpublic_cpt",
  "wp_block",
  "post_type_post",
];

/** Returns every problem in a matrix, so a test can also prove that bad matrices are caught. */
function matrixProblems(candidate: Matrix): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const row of candidate.cases) {
    if (seen.has(row.id)) {
      problems.push(`${row.id}: duplicate id`);
    }
    seen.add(row.id);
    for (const actor of row.actors) {
      if (!candidate.actors.includes(actor)) {
        problems.push(`${row.id}: unknown actor ${actor}`);
      }
    }
    for (const state of row.post_states) {
      if (!candidate.post_states.includes(state)) {
        problems.push(`${row.id}: unknown post state ${state}`);
      }
    }
    if (row.actors.length === 0 || row.auths.length === 0 || row.post_states.length === 0) {
      problems.push(`${row.id}: empty expansion`);
    }
    if (row.expect.status < 400) {
      problems.push(`${row.id}: not a negative case`);
    }
    if (row.surface === "content" && statusByCode.get(row.expect.code) !== row.expect.status) {
      problems.push(`${row.id}: ${row.expect.status} does not match ${row.expect.code}`);
    }
    if (row.route.includes("{id}") && row.post_states.includes("none")) {
      problems.push(`${row.id}: route needs an ID but the state is none`);
    }
  }
  return problems;
}

const contentRows = matrix.cases.filter((row) => row.surface === "content");

function coveredBy(predicate: (row: MatrixCase) => boolean): Set<string> {
  return new Set(matrix.cases.filter(predicate).flatMap((row) => row.post_states));
}

void test("the container copies equal the published contract", () => {
  const published = walk(contractDir)
    .filter((path) => path.endsWith(".json"))
    .map((path) => relative(contractDir, path))
    .sort();
  const copies = walk(copyDir)
    .map((path) => relative(copyDir, path))
    .sort();
  assert.deepEqual(copies, published);
  for (const path of published) {
    assert.equal(
      readFileSync(join(copyDir, path), "utf8"),
      readFileSync(join(contractDir, path), "utf8"),
      path,
    );
  }
});

void test("the matrix is well formed", () => {
  assert.deepEqual(matrixProblems(matrix), []);
  assert.equal(matrix.contract_version, "1.0");
});

void test("the matrix validator catches bad rows", () => {
  const first = contentRows[0];
  assert.ok(first);
  const broken = (change: Partial<MatrixCase>): string[] =>
    matrixProblems({ ...matrix, cases: [{ ...first, ...change }] });
  assert.equal(broken({}).length, 0);
  assert.match(broken({ actors: ["root"] }).join(), /unknown actor/);
  assert.match(broken({ post_states: ["limbo"] }).join(), /unknown post state/);
  assert.match(broken({ auths: [] }).join(), /empty expansion/);
  assert.match(broken({ expect: { status: 200, code: "NOT_FOUND" } }).join(), /negative/);
  assert.match(broken({ expect: { status: 403, code: "NOT_FOUND" } }).join(), /does not match/);
  assert.match(broken({ post_states: ["none"] }).join(), /needs an ID/);
});

void test("every hidden state is a contract 404, for a key holder and in anonymous mode", () => {
  for (const id of [
    "keyed-hidden-state-is-404",
    "keyed-admin-with-key-is-not-widened",
    "anonymous-mode-hidden-state-is-404",
    "anonymous-mode-admin-is-not-widened",
  ]) {
    const row = matrix.cases.find((candidate) => candidate.id === id);
    assert.ok(row, id);
    assert.deepEqual(row.expect, { status: 404, code: "NOT_FOUND" });
    assert.deepEqual([...row.post_states].sort(), [...hiddenStates].sort());
  }
});

void test("admin credentials are covered explicitly on the content routes", () => {
  const adminAuths = new Set(
    contentRows.filter((row) => row.actors.includes("administrator")).flatMap((row) => row.auths),
  );
  for (const auth of ["cookie", "cookie+nonce", "cookie+bad_nonce", "app_password"]) {
    assert.ok(adminAuths.has(auth), auth);
  }
});

void test("every invalid key class has a case with the contracted code", () => {
  const rows = contentRows.filter((row) => row.id === "keyed-bad-keys");
  const auths = new Set(rows.flatMap((row) => row.auths));
  for (const kind of ["wrong", "unknown", "revoked", "expired", "rotated", "malformed", "empty"]) {
    assert.ok(auths.has(`bearer:${kind}`), kind);
  }
  assert.ok(rows.every((row) => row.expect.code === "UNAUTHORIZED"));
  const scope = contentRows.find((row) => row.auths.includes("bearer:wrong_scope"));
  assert.deepEqual(scope?.expect, { status: 403, code: "FORBIDDEN" });
});

void test("query tricks, write methods, and the editor boundary are covered", () => {
  const queried = new Set(
    contentRows.flatMap((row) => Object.keys((row as unknown as { query?: Json }).query ?? {})),
  );
  for (const key of [
    "status",
    "context",
    "_fields",
    "include",
    "password",
    "_envelope",
    "_jsonp",
  ]) {
    assert.ok(queried.has(key), key);
  }
  const writes = new Set(
    contentRows.filter((row) => row.expect.code === "METHOD_NOT_ALLOWED").map((row) => row.method),
  );
  assert.deepEqual([...writes].sort(), ["DELETE", "PATCH", "POST", "PUT"]);
  assert.ok(coveredBy((row) => row.surface === "editor").has("publish_owned"));
  assert.ok(matrix.cases.some((row) => row.id === "editor-publish-needs-publish-pages"));
  assert.ok(matrix.cases.some((row) => row.id === "editor-publish-needs-edit-post"));
});

void test("error examples share one shape and their filename is their code", () => {
  for (const code of errorCodes) {
    const body = readJson(join(errorDir, `${code}.json`));
    assert.deepEqual(Object.keys(body), ["contract_version", "code", "message", "data"], code);
    assert.equal(body["code"], code);
    assert.equal(body["contract_version"], "1.0");
    assert.deepEqual(Object.keys(body["data"] as Json), ["status"]);
  }
  assert.equal(statusByCode.get("NOT_FOUND"), 404);
  assert.equal(statusByCode.get("UNAUTHORIZED"), 401);
  assert.equal(statusByCode.get("FORBIDDEN"), 403);
  assert.equal(statusByCode.get("RATE_LIMITED"), 429);
  assert.equal(statusByCode.get("INVALID_QUERY"), 400);
});

void test("route examples follow the field allowlist and hide operational detail", () => {
  const schema = readJson<{ item_fields: string[]; error_codes: string[] }>(
    join(contractDir, "examples/schema.json"),
  );
  const item = readJson<{ item: Json }>(join(contractDir, "examples/content-item.json"));
  const list = readJson<{ items: Json[] }>(join(contractDir, "examples/content-list.json"));
  assert.deepEqual(Object.keys(item.item), schema.item_fields);
  assert.deepEqual(Object.keys(list.items[0] ?? {}), schema.item_fields);
  assert.deepEqual([...schema.error_codes].sort(), [...errorCodes].sort());
  for (const field of ["author", "email", "meta", "document", "password", "_blixis_document"]) {
    assert.ok(!schema.item_fields.includes(field), field);
  }
  for (const name of ["health.json", "schema.json"]) {
    const text = readFileSync(join(contractDir, "examples", name), "utf8").toLowerCase();
    assert.doesNotMatch(text, /wordpress|php|mariadb|mysql|\/var\/|\/tmp\/|plugin|host/, name);
  }
});

void test("the cache policy never makes a non-public class shareable", () => {
  const policy = readJson<{
    vary: string;
    max_shared_staleness_seconds: number;
    classes: Record<string, { cache_control: string; etag: boolean }>;
    preview: { cache_control_contains: string; x_robots_tag: string };
  }>(join(contractDir, "cache-policy.json"));
  assert.match(policy.classes["keyed_success"]?.cache_control ?? "", /^private/);
  assert.equal(policy.classes["error"]?.cache_control, "no-store");
  assert.equal(policy.classes["error"]?.etag, false);
  assert.equal(policy.classes["health"]?.cache_control, "no-store");
  assert.equal(policy.preview.cache_control_contains, "no-store");
  assert.match(policy.preview.x_robots_tag, /noindex/);
  assert.match(policy.vary, /Authorization/);
  const publicAge = /max-age=(\d+)/.exec(policy.classes["public_success"]?.cache_control ?? "");
  assert.ok(Number(publicAge?.[1]) <= policy.max_shared_staleness_seconds);
});

void test("nothing committed holds a key-shaped string", () => {
  const keyShape = new RegExp("bxk_[a-f0-9]{16}_[A-Za-z0-9_-]{43}");
  for (const path of [...walk(contractDir), ...walk(join(here, "wp"))]) {
    assert.doesNotMatch(readFileSync(path, "utf8"), keyShape, path);
  }
});
