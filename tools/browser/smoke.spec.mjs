// Browser checks of the typing screen (issue #144). They type real rounds
// in a real browser against the real server and check what used to break
// unnoticed: a round that does not finish, a caret taller than its line,
// a result or stats screen that does not open. To add a check: a test()
// here; shared steps (opening the app, typing a round) live in app.mjs.
import { test, expect } from "@playwright/test";
import { openApp, typeRound, waitForText } from "./app.mjs";

// Every test fails on a JavaScript error or a failed API request, even if
// the screen looks right: a silent 400 once hid a missing result screen.
test.beforeEach(async ({ page }, info) => {
  const problems = [];
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
  page.on("response", (r) => { if (r.url().includes("/api/") && r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url()}`); });
  info.problems = problems;
});
test.afterEach(async ({}, info) => {
  expect(info.problems, "errors in the page").toEqual([]);
});

// The caret is one line tall and inside the text box. It once grew to two
// lines when space marks were on and a space sat at a line wrap.
async function expectCaretInLine(page) {
  const m = await page.evaluate(() => {
    const caret = document.getElementById("caret").getBoundingClientRect();
    const box = document.getElementById("text-box").getBoundingClientRect();
    const letter = [...document.querySelectorAll("#text > span")].find((s) => s.textContent.trim())
      .getBoundingClientRect();
    return { h: caret.height, line: letter.height, top: caret.top, bottom: caret.bottom, boxTop: box.top, boxBottom: box.bottom };
  });
  expect(m.h, "caret height vs a letter").toBeLessThan(m.line * 1.3);
  expect(m.h, "caret height vs a letter").toBeGreaterThan(m.line * 0.5);
  expect(m.top, "caret top inside the text box").toBeGreaterThanOrEqual(m.boxTop - 2);
  expect(m.bottom, "caret bottom inside the text box").toBeLessThanOrEqual(m.boxBottom + 2);
}

async function expectResult(page) {
  await expect(page.locator("body")).toHaveClass(/\btb-resulting\b/);
  await expect(page.locator("#result")).toBeVisible();
  await expect(page.locator("#result")).toContainText(/\d/);
}

// Learn has no result screen: the round is saved (POST /api/v1/results),
// the panel takes its numbers and the next round starts at word 0.
test("Learn: a round can be typed to the end and is saved", async ({ page }) => {
  let saved = false;
  page.on("response", (r) => {
    if (r.request().method() === "POST" && new URL(r.url()).pathname === "/api/v1/results" && r.ok()) saved = true;
  });
  await openApp(page, { "tt.mode.en": "learn", "tt.length.learn": "words-15" });
  await expect(page.locator("body")).toHaveAttribute("data-mode", "learn");
  await typeRound(page, { done: async () => saved });
  await expect(page.locator("#progress")).toHaveText(/^0\/15/);
  // "Last round" shows the round's wpm (numbers are drawn by CSS from data-n)
  await expect(page.locator("#learn-panel .lp-last [data-n]").first()).toHaveAttribute("data-n", /^[1-9]/);
});

// Learn offers 15 or 30 words; Climb and Freetype 10 and up
const MODES = [
  { name: "Climb", storage: { "tt.mode.en": "climb", "tt.length.climb": "words-10" } },
  { name: "Freetype", storage: { "tt.mode.en": "freetype", "tt.length.freetype": "words-10" } },
];

for (const mode of MODES) {
  test(`${mode.name}: a round can be typed to the end and shows the result`, async ({ page }) => {
    await openApp(page, mode.storage);
    await expect(page.locator("body")).toHaveAttribute("data-mode", mode.storage["tt.mode.en"]);
    await typeRound(page);
    await expectResult(page);
    // Tab starts the next round
    await page.keyboard.press("Tab");
    await expect(page.locator("body")).not.toHaveClass(/\btb-resulting\b/);
    await waitForText(page);
  });
}

test("the caret stays one line tall with space marks across line wraps", async ({ page }) => {
  // 30 words fill several lines, so the caret passes spaces at line wraps
  await openApp(page, { "tt.mode.en": "freetype", "tt.length.freetype": "words-30", "tt.ws": "dot" });
  await typeRound(page, { afterKey: () => expectCaretInLine(page) });
  await expectResult(page);
});

test("light theme: a round finishes and the caret stays in its line", async ({ page }) => {
  await openApp(page, { "tt.theme": "light", "tt.mode.en": "climb", "tt.length.climb": "words-10" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await typeRound(page, { afterKey: () => expectCaretInLine(page) });
  await expectResult(page);
});

test("the stats screen opens after a round and shows it", async ({ page }) => {
  await openApp(page, { "tt.mode.en": "climb", "tt.length.climb": "words-10" });
  await typeRound(page);
  await expectResult(page);
  await page.locator("#tab-stats").click();
  await expect(page.locator("#view-stats")).toBeVisible();
  await expect(page.locator("#view-type")).toBeHidden();
  await expect(page.locator("#tiles > *").first()).toBeVisible();
});
