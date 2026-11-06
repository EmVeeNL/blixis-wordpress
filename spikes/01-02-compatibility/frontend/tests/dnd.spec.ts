import { test as base, expect, type Page } from "@playwright/test";

type Tree = { id: string; items: string[] }[];

// Fails any test that raises an uncaught page error.
const test = base.extend<{ guarded: void }>({
  guarded: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript(() => {
        const log: string[] = [];
        (window as unknown as { announced: string[] }).announced = log;
        new MutationObserver((records) => {
          for (const r of records) {
            const host = r.target instanceof Element ? r.target : r.target.parentElement;
            if (host?.closest("[aria-live]")) log.push(host.textContent ?? "");
          }
        }).observe(document, { subtree: true, childList: true, characterData: true });
      });
      await page.goto("/");
      await expect(page.getByTestId("handle-a1")).toBeVisible();
      await use();
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});

const state = async (page: Page): Promise<Tree> =>
  JSON.parse((await page.getByTestId("state").textContent()) ?? "[]");
const items = (tree: Tree, id: string): string[] | undefined =>
  tree.find((s) => s.id === id)?.items;
const order = (tree: Tree): string[] => tree.map((s) => s.id);
const announced = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as { announced: string[] }).announced);

// KeyboardSensor attaches its keydown listener in a setTimeout after pick-up, so a
// key sent in the same tick is lost. Waiting for the announcement matches real use.
async function pickUp(page: Page, id: string): Promise<void> {
  await page.getByTestId(`handle-${id}`).focus();
  await page.keyboard.press("Space");
  await expect.poll(() => announced(page)).toContainEqual(expect.stringContaining(id));
  await page.waitForTimeout(50);
}

async function drag(page: Page, fromId: string, toId: string, targetOffset = 0.5): Promise<void> {
  const from = await page.getByTestId(fromId).boundingBox();
  const to = await page.getByTestId(toId).boundingBox();
  if (!from || !to) throw new Error("Element has no box");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 6, from.y + from.height / 2 + 6, { steps: 3 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height * targetOffset, { steps: 12 });
  await page.waitForTimeout(100);
  await page.mouse.up();
}

test("pointer: reorders an item within a section", async ({ page }) => {
  await drag(page, "handle-a1", "item-a3");
  await expect(page.getByTestId("result")).toHaveText("moved");
  expect(items(await state(page), "section-a")).toEqual(["a2", "a3", "a1"]);
});

test("pointer: moves an item into another section", async ({ page }) => {
  await drag(page, "handle-a2", "item-b1");
  await expect(page.getByTestId("result")).toHaveText("moved");
  const tree = await state(page);
  expect(items(tree, "section-a")).toEqual(["a1", "a3"]);
  expect(items(tree, "section-b")).toEqual(["a2", "b1"]);
});

test("pointer: moves an item into an empty section", async ({ page }) => {
  await drag(page, "handle-a1", "section-c");
  await expect(page.getByTestId("result")).toHaveText("moved");
  expect(items(await state(page), "section-c")).toEqual(["a1"]);
});

test("pointer: reorders sections", async ({ page }) => {
  await drag(page, "handle-section-a", "handle-section-b");
  await expect(page.getByTestId("result")).toHaveText("moved");
  expect(order(await state(page))).toEqual(["section-b", "section-a", "section-c"]);
});

test("pointer: refuses a section dropped on an item (invalid nesting)", async ({ page }) => {
  const before = await state(page);
  await drag(page, "handle-section-b", "item-a2");
  await expect(page.getByTestId("result")).toHaveText("refused");
  expect(await state(page)).toEqual(before);
});

test("keyboard: moves an item, announces it, and keeps focus", async ({ page }) => {
  await pickUp(page, "a1");
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(100);
  await page.keyboard.press("Space");
  await expect(page.getByTestId("result")).toHaveText("moved");
  expect(items(await state(page), "section-a")).toEqual(["a2", "a1", "a3"]);
  await expect.poll(() => announced(page)).toContainEqual("Dropped a1 on a2.");
  expect(await announced(page)).toContainEqual("Picked up a1.");
  await expect(page.getByTestId("handle-a1")).toBeFocused();
});

test("keyboard: moves an item across sections", async ({ page }) => {
  await pickUp(page, "a3");
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(100);
  await page.keyboard.press("Space");
  await expect(page.getByTestId("result")).toHaveText("moved");
  const tree = await state(page);
  expect(items(tree, "section-a")).toEqual(["a1", "a2"]);
  expect(items(tree, "section-b")).toEqual(["a3", "b1"]);
});

test("keyboard: moves an item into an empty section", async ({ page }) => {
  await pickUp(page, "b1");
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(100);
  await page.keyboard.press("Space");
  await expect(page.getByTestId("result")).toHaveText("moved");
  const tree = await state(page);
  expect(items(tree, "section-b")).toEqual([]);
  expect(items(tree, "section-c")).toEqual(["b1"]);
});

test("keyboard: reorders sections", async ({ page }) => {
  await pickUp(page, "section-a");
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(100);
  await page.keyboard.press("Space");
  await expect(page.getByTestId("result")).toHaveText("moved");
  expect(order(await state(page))).toEqual(["section-b", "section-a", "section-c"]);
});

test("keyboard: Escape cancels without changing the tree", async ({ page }) => {
  const before = await state(page);
  await pickUp(page, "a1");
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(100);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("result")).toHaveText("cancelled");
  expect(await state(page)).toEqual(before);
  await expect(page.getByTestId("handle-a1")).toBeFocused();
});
