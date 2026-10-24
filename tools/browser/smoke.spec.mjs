// Browser checks of the typing screen (issue #144). They type real rounds
// in a real browser against the real server and check what used to break
// unnoticed: a round that does not finish, a caret taller than its line,
// a result or stats screen that does not open. To add a check: a test()
// here; shared steps (opening the app, typing a round) live in app.mjs.
import { test, expect } from "@playwright/test";
import { openApp, typeRound, waitForText, nextChar } from "./app.mjs";

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
// lines when a marked space sat at a line wrap (every space has its dot now).
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

// Learn's summary is read between rounds (issue #150): the panel shows
// before the first key and goes with it (opacity only, the room stays),
// the letters row slides down into its place; the live numbers stand
// right after the word counter while you type.
test("Learn: the panel shows at rest and goes while typing", async ({ page }) => {
  await openApp(page, { "tt.mode.en": "learn", "tt.length.learn": "words-15", "tt.live": "1" });
  const panel = page.locator("#learn-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveCSS("opacity", "1");
  const room = await panel.boundingBox();
  const row = page.locator("#letters");
  const rowAt = (await row.boundingBox()).y;
  await page.keyboard.type(await nextChar(page));
  await expect(panel).toHaveCSS("opacity", "0");
  const wpm = page.locator(".live > .metric.num").first();
  await expect(wpm).toHaveCSS("opacity", "1");
  const counter = await page.locator("#progress").boundingBox();
  const lastCol = await page.locator("#learn-panel .lp-goal").boundingBox();
  const speed = await wpm.boundingBox();
  expect(speed.x, "the speed right after the word counter").toBeGreaterThan(counter.x + counter.width);
  expect(speed.x, "not in the last column").toBeLessThan(lastCol.x);
  expect(await panel.boundingBox(), "the panel keeps its room").toEqual(room);
  await expect.poll(async () => (await row.boundingBox()).y, "the letters row in the panel's place")
    .toBeCloseTo(room.y + room.height / 2 - (await row.boundingBox()).height / 2, -1);
  expect(rowAt).toBeLessThan(room.y);
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

// A round the server does not keep (issue #149). A lost connection is
// tried again twice, then the result screen still shows the round with
// "Save again"; a round the server turns down (4xx) is not tried again.
// Climb's level moves only once the round is saved. The failed requests
// and their console errors are expected here, so they are taken out of
// the list the afterEach checks.
const expectedOnly = (info, path) => {
  const rest = info.problems.filter((p) => !p.includes(path) && !p.startsWith("console:"));
  info.problems.splice(0, info.problems.length, ...rest);
};

test("Climb: an unsaved round still shows its result and can be saved again", async ({ page }, info) => {
  await openApp(page, { "tt.mode.en": "climb", "tt.length.climb": "words-10" });
  let tries = 0;
  await page.route("**/api/v1/freeplay/results*", (route) => { tries++; return route.abort(); });
  await typeRound(page);
  await expectResult(page);
  const line = page.locator("#result .r-unsaved");
  await expect(line).toContainText("Not saved: no connection");
  expect(tries, "the save and its two retries").toBe(3);
  await page.unroute("**/api/v1/freeplay/results*");
  await line.getByRole("button", { name: "Save again" }).click();
  await expect(line).toHaveCount(0);
  await expect(page.locator("#result .r-climb")).toBeVisible();   // what the round counted for
  expectedOnly(info, "/freeplay/results");
});

test("Climb: a round whose answer was lost is sent again and kept once", async ({ page }, info) => {
  await openApp(page, { "tt.mode.en": "climb", "tt.length.climb": "words-10" });
  let tries = 0;
  // the first try reaches the server, but its answer never comes back
  await page.route("**/api/v1/freeplay/results*", async (route) => {
    if (++tries === 1) { await route.fetch(); return route.abort(); }
    return route.continue();
  });
  await typeRound(page);
  await expectResult(page);
  await expect(page.locator("#result .r-climb")).toBeVisible();
  expect(tries).toBe(2);
  const count = await page.evaluate(async () =>
    (await (await fetch("/api/v1/freeplay/stats?lang=en&length=words-10")).json()).sessionCount);
  expect(count, "rounds in the Climb history").toBe(1);
  expectedOnly(info, "/freeplay/results");
});

test("Freetype: a round the server turns down says so and is not tried again", async ({ page }, info) => {
  await openApp(page, { "tt.mode.en": "freetype", "tt.length.freetype": "words-10" });
  let tries = 0;
  await page.route("**/api/v1/freetype/results*", (route) => {
    tries++;
    return route.fulfill({ status: 400, contentType: "application/json", body: '{"error":"wpm or accuracy out of range"}' });
  });
  await typeRound(page);
  await expectResult(page);
  const line = page.locator("#result .r-unsaved");
  await expect(line).toContainText("looks impossible");
  await expect(line.getByRole("button")).toHaveCount(0);
  expect(tries).toBe(1);
  expectedOnly(info, "/freetype/results");
});

test("Learn: an unsaved round offers to save it again", async ({ page }, info) => {
  await openApp(page, { "tt.mode.en": "learn", "tt.length.learn": "words-15" });
  await page.route("**/api/v1/results*", (route) => route.abort());
  await typeRound(page, { done: async () => page.locator("#notice .note-act").isVisible() });
  await page.unroute("**/api/v1/results*");
  await page.locator("#notice .note-act").click();
  await expect(page.locator("#notice")).toContainText("Saved");
  expectedOnly(info, "/api/v1/results");
});

// The falling background is off for a new visitor (issue #150) and shows
// once it is turned on (an older choice, "letters", counts as on).
test("the background is off by default and on when chosen", async ({ page }) => {
  await openApp(page);
  await expect(page.locator(".ambient")).toHaveAttribute("data-kind", "off");
  await expect(page.locator(".ambient > *")).toHaveCount(0);
  await page.evaluate(() => localStorage.setItem("tt.bg", "letters"));
  await page.reload();
  await waitForText(page);
  await expect(page.locator(".ambient")).toHaveAttribute("data-kind", "keys");
  await expect(page.locator(".ambient > *").first()).toBeAttached();
});

// At rest the caret stands still, every space shows its dot, and the
// settings offer two carets and no "caret at rest" or "space marks"
// (issue #167). An old saved caret falls back to the line.
test("the caret is still at rest, spaces have a dot, the settings are fewer", async ({ page }) => {
  await openApp(page, { "tt.caret": "outline", "tt.blink": "pulse", "tt.ws": "none" });
  await expect(page.locator("body")).toHaveAttribute("data-caret", "line");
  await page.waitForTimeout(1500);   // longer than the old wait before it started to breathe
  const caretAnims = await page.evaluate(() => document.getElementById("caret").getAnimations().length);
  expect(caretAnims, "animations on the caret at rest").toBe(0);
  const dot = await page.evaluate(() => {
    const sp = document.querySelector("#text span[data-sp]");
    const a = getComputedStyle(sp, "::after");
    return { content: a.content, w: parseFloat(a.width) };
  });
  expect(dot.content).not.toBe("none");
  expect(dot.w).toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  await expect(page.getByText("Caret movement")).toBeVisible();
  await expect(page.getByText("Caret at rest")).toHaveCount(0);
  await expect(page.getByText("Space marks")).toHaveCount(0);
});

// The keyboard is not a setting (issue #150): Learn shows it while
// letters are locked, Climb hides it, and so does Learn once every letter
// is open (even with an old "keyboard off" choice saved, Learn shows it).
// The hand stands on the keyboard with no card around it.
test("the keyboard shows only while Learn opens letters", async ({ page }) => {
  await openApp(page, { "tt.mode.en": "learn", "tt.kbHidden": "1" });
  const kb = page.locator("#keyboard");
  await expect(kb).toBeVisible();
  const card = await page.locator(".keyboard > .hands").evaluate((h) => {
    const c = getComputedStyle(h);
    return { bg: c.backgroundColor, shadow: c.boxShadow };
  });
  expect(card, "no card around the hand").toEqual({ bg: "rgba(0, 0, 0, 0)", shadow: "none" });
  await page.keyboard.press("Escape");
  await expect(page.locator(".sw-name", { hasText: /^Next key$/ })).toBeVisible();
  await expect(page.locator(".sw-name", { hasText: /^Keyboard$/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.locator("#tab-climb").click();
  await expect(kb).toBeHidden();
  await page.locator("#tab-learn").click();
  await expect(kb).toBeVisible();
  await page.request.post("/api/v1/progress?lang=en", { data: { unlockAll: true } });
  await page.reload();
  await waitForText(page);
  await expect(kb).toBeHidden();
});

// One layout for the three modes (issue #150): the letters and the text
// stand at the same place in Learn, Climb and Freetype; the hidden
// keyboard keeps its room.
test("the text stands at the same place in every mode", async ({ page }) => {
  await openApp(page, { "tt.mode.en": "learn" });
  const top = async () => Math.round((await page.locator("#text-box").boundingBox()).y);
  const learn = await top();
  for (const m of ["climb", "freetype", "learn"]) {
    await page.locator(`#tab-${m}`).click();
    await waitForText(page);
    // the keyboard folds away or in first: measure once it is done
    await expect(page.locator("#keyboard")).toHaveClass(m === "learn" ? /^(?!.*\boff\b)/ : /\boff\b/);
    await page.waitForFunction(() => !document.getAnimations().some((a) => a.playState === "running" && a.effect?.target?.closest?.("#keyboard, #text-box, .letters")));
    expect(await top(), `the text in ${m}`).toBe(learn);
  }
});

// The hand over the keyboard is a picture per finger (keyboard.js
// handPicture); its <img> says which fingers it shows (data-f). After every
// key the shown hands must be the ones of the next key's fingers, as the
// layout data says: the thumbs for a space, both hands then.
test("the hand over the keyboard shows the finger of the next key", async ({ page }) => {
  await openApp(page, { "tt.mode.en": "learn" });
  const fingerOf = await page.evaluate(async () => {
    const layout = await (await fetch("/api/v1/layout?lang=en")).json();
    return Object.fromEntries(layout.rows.flat().map((k) => [k.char, k.finger]));
  });
  const side = (id) => (id === "thl" || id[0] === "l" ? "l" : "r");
  for (let i = 0; i < 25; i++) {
    const ch = await nextChar(page);
    if (!ch) break;
    const ids = fingerOf[ch] === "th" ? ["thl", "thr"] : [fingerOf[ch]];
    const sides = [...new Set(ids.map(side))];
    await expect(page.locator("#hands")).toHaveAttribute("data-show", sides.length === 2 ? "lr" : sides[0]);
    for (const s of sides) {
      await expect(page.locator(`.keyboard .hand.${s === "l" ? "left" : "right"} > img`))
        .toHaveAttribute("data-f", ids.filter((id) => side(id) === s).join(" "));
    }
    await page.keyboard.type(ch);
  }
});

test("the caret stays one line tall with space marks across line wraps", async ({ page }) => {
  // 30 words fill several lines, so the caret passes spaces at line wraps
  await openApp(page, { "tt.mode.en": "freetype", "tt.length.freetype": "words-30" });
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
