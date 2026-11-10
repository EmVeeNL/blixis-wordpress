import assert from "node:assert/strict";
import { test } from "node:test";
import { layoutDefaults } from "@blixis/tokens";
import {
  buildLayout,
  checkLayout,
  fieldIdFor,
  trimText,
  trimUrl,
  valuesOf,
} from "../src/layout-form.ts";

const base = layoutDefaults("acme-site");

// What a submitted form holds for the default layout: off checkboxes are absent.
function form(extra: Record<string, string> = {}): Map<string, string> {
  return valuesOf(
    Object.entries({
      "layout[header][logo]": "start",
      "layout[header][mobileMenu]": "mobile",
      "layout[footer][stickToBottom]": "1",
      "layout[footer][columns]": "1",
      "layout[footer][contact]": "",
      "layout[footer][copyright][enabled]": "1",
      "layout[footer][copyright][text]": "© {year} {site}",
      "layout[header][cta][text]": "",
      "layout[header][cta][url]": "",
      ...extra,
    }),
  );
}

void test("the default form describes the default layout and passes the validator", () => {
  const { built, errors } = checkLayout(form(), base);
  assert.deepEqual(errors, []);
  assert.deepEqual(built.config, base);
});

void test("blank USP texts and social rows are dropped and errors point at the typed row", () => {
  const values = form({
    "layout[header][usp][enabled]": "1",
    "layout[header][usp][items][0]": "",
    "layout[header][usp][items][1]": "Free shipping",
    "layout[header][usp][items][2]": "Bad <b>",
    "layout[footer][social][0][service]": "facebook",
    "layout[footer][social][0][url]": "",
    "layout[footer][social][1][service]": "x",
    "layout[footer][social][1][url]": "  https://x.example/acme  ",
    "layout[footer][social][2][service]": "github",
    "layout[footer][social][2][url]": "http://insecure.example",
  });
  const built = buildLayout(values, base);
  const footer = built.config["footer"] as { social: { service: string; url: string }[] };
  assert.deepEqual(footer.social[0], { service: "x", url: "https://x.example/acme" });
  assert.equal(footer.social.length, 2);
  const { errors } = checkLayout(values, base);
  assert.deepEqual(errors, [
    { code: "url.invalid", path: "/footer/social/2/url" },
    { code: "text.markup", path: "/header/usp/items/2" },
  ]);
  assert.equal(fieldIdFor("/header/usp/items/2"), "blixis-header-usp-items-2");
  assert.equal(fieldIdFor("/header/mobileMenu"), "blixis-header-mobilemenu");
});

void test("a switch that is on needs its text, and the contract trims text but not URLs", () => {
  const { errors } = checkLayout(
    form({ "layout[header][cta][enabled]": "1", "layout[header][cta][url]": "  /contact " }),
    base,
  );
  assert.deepEqual(errors, [{ code: "text.empty", path: "/header/cta/text" }]);
  assert.equal(trimUrl(" \t/contact\n\0"), "/contact");
  assert.equal(trimUrl(" /x"), " /x", "only what PHP trim() removes");
  assert.equal(trimText("  a \n"), "a");
});

void test("columns outside one to four and unknown choices are refused like on the server", () => {
  const { errors } = checkLayout(
    form({ "layout[footer][columns]": "5", "layout[header][logo]": "left" }),
    base,
  );
  assert.deepEqual(
    errors.map((error) => error.code),
    ["footer.columns.invalid", "header.logo.invalid"],
  );
});

void test("only layout fields are read from a form", () => {
  const values = valuesOf([
    ["config[colors][primary]", "#fff"],
    ["layout[header][logo]", "center"],
    ["_wpnonce", "x"],
  ]);
  assert.deepEqual([...values.keys()], ["layout[header][logo]"]);
});
