import { test, expect } from "@playwright/test";

test("deliberate failure", () => {
  expect(1).toBe(2);
});
