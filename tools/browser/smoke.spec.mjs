// Browser checks of the typing screen.
import { test, expect } from "@playwright/test";
import { openApp, typeRound, waitForText, nextChar } from "./app.mjs";

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

// Learn's /stats as if 12 rounds were typed: speeds newest first, the last 4 at 97%.
async function withHistory(page) {
  const wpms = [52, 51, 48, 50, 49, 47, 48, 45, 46, 44, 45, 43];
  await page.route("**/api/v1/stats?*", async (route) => {
    const res = await route.fetch(), body = await res.json();
    body.sessions = wpms.map((wpm, i) => ({ ...(body.sessions?.[0] ?? {}), wpm, accuracy: i < 4 ? 97 : 90 }));
    body.forecast = { known: true, rounds: 4, letter: "e" };
    return route.fulfill({ response: res, json: body });
  });
}

test("Learn: a round can be typed to the end and is saved", async ({ page }) => {
  let saved = false;
  page.on("response", (r) => {
    if (r.request().method() === "POST" && new URL(r.url()).pathname === "/api/v1/results" && r.ok()) saved = true;
  });
  await openApp(page, { "tt.mode.en": "learn", "tt.length.learn": "words-15" });
  await expect(page.locator("body")).toHaveAttribute("data-mode", "learn");
  const next = (await page.locator("#letters .locked.next").first().textContent()).trim();
  await expect(page.locator("#lp-cols .lp-intro .lp-key"), "before the first round: how to open the next letter").toHaveText(next);
  await expect(page.locator("#lp-cols .lp-intro .lp-val")).toHaveText("20 presses, under 5% mistakes, 30 wpm");
  await expect(page.locator("#lp-cols .lp-last")).toHaveCount(0);
  await expect(page.locator("#lp-cols .lp-goal"), "the daily goal waits for the first round").toHaveCount(0);
  await typeRound(page, { done: async () => saved });
  await expect(page.locator("#round-line")).toHaveAttribute("data-tip-text", /^0\/15 /);
  await expect(page.locator("#lp-cols .lp-intro")).toHaveCount(0);
  await expect(page.locator("#lp-cols .lp-last [data-n]").first()).toHaveAttribute("data-n", /^[1-9]/);
  await expect(page.locator("#lp-cols .lp-goal"), "the daily goal after the first round").toBeVisible();
});

test("Learn: the panel draws the speed line, the next letter and the streak dots, with equal gaps", async ({ page }) => {
  await withHistory(page);
  await openApp(page, { "tt.mode.en": "learn" });
  const spark = page.locator("#lp-cols .lp-last .lp-spark");
  await expect(spark.locator("polyline")).toHaveAttribute("points", /^(\S+ ){9}\S+$/);
  await expect(spark.locator("line.avg")).toHaveCount(1);
  await expect(spark).toHaveAttribute("data-tip-text", /faster/);
  const next = await page.locator("#letters .locked.next").first().textContent();
  await expect(page.locator("#lp-cols .lp-fc .lp-key")).toHaveText(next.trim());
  await expect(page.locator("#lp-cols .lp-streak .lp-dots i.on")).toHaveCount(4);
  const boxes = await Promise.all(["#lp-cols .lp-last", "#lp-cols .lp-fc", "#lp-cols .lp-streak", "#lp-cols .lp-goal", "#round-switch"]
    .map((s) => page.locator(s).boundingBox()));
  const gaps = boxes.slice(1).map((b, i) => b.x - (boxes[i].x + boxes[i].width));
  for (const g of gaps) expect(g, `gaps ${gaps.map(Math.round)}`).toBeCloseTo(gaps[0], 0);
});

test("Learn: its events animate the letters row, a best round wears the foil, no confetti", async ({ page }) => {
  await withHistory(page);
  await openApp(page, { "tt.mode.en": "learn" });
  const chips = page.locator("#letters .chip");
  const open = (await chips.first().textContent()).trim();
  await page.evaluate(async (c) => {
    const m = await import("/letters.js");
    m.markNewLetter(c);
    m.markMastered([c]);
    m.renderLetters();
  }, open);
  await expect(chips.first(), "a new letter flips open with a ring").toHaveClass(/\bpop\b/);
  await expect(chips.first().locator("> .ring")).toHaveCount(1);
  await expect(chips.first().locator("> .fill"), "a mastered letter fills green").toHaveCount(1);
  await expect(page.locator("#letters .chip.locked.next"), "the dashed frame arrives on the next letter").toHaveClass(/\barrive\b/);
  const n = await chips.count();
  await page.evaluate(async () => (await import("/fx.js")).FX.wave(document.getElementById("letters")));
  await expect(page.locator("#letters .chip > .wave"), "a wave runs along every letter").toHaveCount(n);
  await expect(page.locator("#letters .chip > .wave"), "and cleans up after itself").toHaveCount(0, { timeout: 5000 });
  await page.evaluate(async () => {
    const m = await import("/learnpanel.js");
    m.roundNews({ best: true, mastered: [] });
    m.renderPanel();
  });
  await expect(page.locator("#lp-cols .lp-last .lp-best.foil"), "a best round's speed wears the foil").toHaveCount(1);
  await expect(page.locator("canvas.confetti")).toHaveCount(0);
});

test("Learn: typing dims the line above the text and moves nothing", async ({ page }) => {
  await withHistory(page);
  await openApp(page, { "tt.mode.en": "learn", "tt.length.learn": "words-15", "tt.live": "1" });
  const last = page.locator("#lp-cols .lp-last"), streak = page.locator("#lp-cols .lp-streak");
  const goal = page.locator("#lp-cols .lp-goal"), round = page.locator("#round-switch");
  const row = page.locator("#letters");
  await expect(last).toBeVisible();
  await expect(streak).toHaveCSS("opacity", "1");
  const at = async () => Promise.all([row, last, streak, goal, round].map(async (l) => (await l.boundingBox()).y));
  const before = await at();
  const lastX = (await last.boundingBox()).x;
  expect(lastX, "the cells start at the text").toBeCloseTo((await page.locator("#text").boundingBox()).x, 0);
  await page.keyboard.type(await nextChar(page));
  await expect(streak).toHaveCSS("opacity", "0.35");
  await expect(round).toHaveCSS("opacity", "0.35");
  await expect(goal).toHaveCSS("opacity", "1");
  await expect(last).toHaveCSS("opacity", "0");
  const wpm = page.locator(".live > .metric.num").first();
  await expect(wpm).toHaveCSS("opacity", "1");
  expect((await wpm.boundingBox()).x, "this round's speed where the last round's was").toBeCloseTo(lastX, -1);
  await page.waitForTimeout(500);
  expect(await at(), "nothing moved").toEqual(before);
});

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
    await page.keyboard.press("Tab");
    await expect(page.locator("body")).not.toHaveClass(/\btb-resulting\b/);
    await waitForText(page);
  });

  test(`${mode.name}: typing dims the round switches and moves nothing`, async ({ page }) => {
    await openApp(page, mode.storage);
    const bar = page.locator("#mode-bar");
    await expect(bar).toHaveCSS("opacity", "1");
    const before = await bar.boundingBox();
    await page.keyboard.type(await nextChar(page));
    await expect(bar).toHaveCSS("opacity", "0.35");
    await bar.hover();
    await expect(bar).toHaveCSS("opacity", "1");
    expect(await bar.boundingBox(), "the bar stays where it was").toEqual(before);
  });
}

test("Freetype: a faster round shows New best in foil, and the small button starts the next round", async ({ page }) => {
  await openApp(page, { "tt.mode.en": "freetype", "tt.length.freetype": "words-10" });
  await typeRound(page, { delay: 160 });
  await expectResult(page);
  await expect(page.locator("#result .r-best")).toHaveCount(0);
  await expect(page.locator(".hints .result-only")).toBeVisible();
  await expect(page.locator(".hints .round-only").first()).toBeHidden();
  await page.locator("#result .r-next").click();
  await expect(page.locator("body")).not.toHaveClass(/\btb-resulting\b/);
  await waitForText(page);
  await typeRound(page, { delay: 40 });
  await expectResult(page);
  await expect(page.locator("#result .r-best")).toHaveText("New best");
  await expect(page.locator("#result .r-num.hero > b.foil")).toHaveCount(1);
  expect(await page.locator(".confetti").count(), "no confetti").toBe(0);
  await page.keyboard.press("Enter");
  await expect(page.locator("body")).not.toHaveClass(/\btb-resulting\b/);
});

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
  await expect(page.locator("#result .r-climb")).toBeVisible();
  expectedOnly(info, "/freeplay/results");
});

test("Climb: a round whose answer was lost is sent again and kept once", async ({ page }, info) => {
  await openApp(page, { "tt.mode.en": "climb", "tt.length.climb": "words-10" });
  let tries = 0;
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

test("the start screen plays its full length only on the first visit", async ({ page }) => {
  const ready = async () => {
    const t0 = Date.now();
    await page.goto("/");
    await waitForText(page);
    return Date.now() - t0;
  };
  await page.addInitScript(() => localStorage.setItem("tt.introDone", "1"));
  const first = await ready();
  expect(first, "the first visit shows the whole splash").toBeGreaterThanOrEqual(1750);
  const again = await ready();
  expect(again, "a later visit doesn't wait for it").toBeLessThan(1500);
});

test("Live stats is on for a new user and doesn't switch itself", async ({ page }) => {
  await openApp(page, { "tt.mode.en": "climb", "tt.length.climb": "words-10" });
  await expect(page.locator("body")).not.toHaveClass(/\blive-off\b/);
  await page.evaluate(() => localStorage.setItem("tt.live", "0"));
  await page.reload();
  await waitForText(page);
  await expect(page.locator("body")).toHaveClass(/\blive-off\b/);
  await typeRound(page);
  await expectResult(page);
  expect(await page.evaluate(() => localStorage.getItem("tt.live")), "a finished round leaves the setting alone").toBe("0");
  await expect(page.locator("body")).toHaveClass(/\blive-off\b/);
});

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

test("the caret is still at rest, spaces have a dot, the settings are fewer", async ({ page }) => {
  await openApp(page, { "tt.caret": "outline", "tt.blink": "pulse", "tt.ws": "none" });
  await expect(page.locator("body")).toHaveAttribute("data-caret", "line");
  await page.waitForTimeout(1500);
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
  const names = await page.locator("#settings-win .sw-name").allTextContents();
  expect(names, "only what holds for the whole site").toEqual(["Theme", "Caret", "Caret movement", "Falling keycaps",
    "Live stats", "Stop on a mistake", "Sounds", "Break reminder", "Progress data", "Reset progress"]);
  await expect(page.locator("#settings-win input[type=text]"), "no search").toHaveCount(0);
  const preview = page.locator("#settings-win .sw-preview");
  await expect(preview, "no preview on Theme").toBeHidden();
  await page.keyboard.press("ArrowDown");
  await expect(preview, "the preview next to Caret").toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(preview, "the preview next to Caret movement").toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(preview, "no preview on Falling keycaps").toBeHidden();
  const list = await page.locator("#settings-win .sw-list").evaluate((l) => l.scrollHeight <= l.clientHeight);
  expect(list, "every row fits without scrolling").toBe(true);
});

test("the settings of one screen live on that screen", async ({ page }) => {
  await withHistory(page);
  await openApp(page, { "tt.mode.en": "freetype" });
  const streak = page.locator('#mode-bar button[data-streak]');
  await expect(streak).toHaveAttribute("aria-pressed", "false");
  await streak.click();
  await expect(streak).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => localStorage.getItem("tt.streak.free"))).toBe("1");

  await page.locator("#tab-learn").click();
  await waitForText(page);
  const goal = page.locator("#lp-cols .lp-goal");
  await goal.click();
  const pop = page.locator("#mini-pop");
  await expect(pop.locator('button[data-key="daily"][aria-pressed="true"]')).toHaveText("15");
  await pop.locator('button[data-key="daily"][data-value="0"]').click();
  await page.keyboard.press("Escape");
  await expect(goal.locator(".lp-val")).toHaveText("Off");
  expect(await page.evaluate(() => localStorage.getItem("tt.daily"))).toBe("0");

  await page.keyboard.press("Shift+Tab");
  await page.locator('#stats-pick button[data-mode="climb"]').click();
  await page.locator("#goal-pick button.goal-chip").click();
  await page.keyboard.type("50");
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => localStorage.getItem("tt.goal"))).toBe("50");
});

test("stats: the goal line is a number of your own, and Learn's is its target", async ({ page }) => {
  await withHistory(page);
  await openApp(page, { "tt.mode.en": "climb", "tt.goal": "100" });
  await page.locator("#tab-stats").click();
  const chip = page.locator("#goal-pick .goal-chip");
  await expect(chip).toHaveText(/^Goal 100 wpm/);

  await chip.click();
  await page.keyboard.type("x137");
  await page.keyboard.press("Enter");
  await expect(chip, "letters are ignored").toHaveText(/^Goal 137 wpm/);
  expect(await page.evaluate(() => localStorage.getItem("tt.goal"))).toBe("137");
  await expect(page.locator("#tiles .tile.goal b")).toHaveText("137");

  await chip.click();
  await page.keyboard.type("90");
  await page.keyboard.press("Escape");
  await expect(chip, "Esc keeps the old goal").toHaveText(/^Goal 137 wpm/);
  await expect(page.locator("#settings-win")).not.toHaveAttribute("open", "");

  await chip.click();
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Enter");
  await expect(chip, "an empty field turns it off").toHaveText(/^Goal: off/);
  await expect(page.locator("#tiles .tile.goal")).toHaveCount(0);

  await page.locator('#stats-pick button[data-mode="learn"]').click();
  const target = await page.evaluate(() => fetch("/api/v1/stats?length=words-30").then((r) => r.json()).then((s) => s.targetWpm));
  await expect(page.locator("#goal-pick span.goal-chip"), "Learn shows its own target, not a button").toHaveText(`Goal ${target} wpm`);
  await expect(page.locator("#goal-pick button")).toHaveCount(0);
});

test("browser zoom 200% keeps the desktop layout and nothing overlaps", async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: "http://localhost:3000", viewport: { width: 960, height: 500 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await openApp(page, { "tt.mode.en": "learn" });
  const m = await page.evaluate(() => {
    const cells = [...document.querySelectorAll("#lp-cols > .lp-cell"), document.getElementById("round-switch")]
      .map((n) => n.getBoundingClientRect());
    return {
      sideways: document.documentElement.scrollWidth > innerWidth,
      railAtBottom: document.getElementById("rail").getBoundingClientRect().top > innerHeight / 2,
      overlaps: cells.slice(1).filter((r, i) => r.left < cells[i].right - 1).length,
    };
  });
  expect(m).toEqual({ sideways: false, railAtBottom: false, overlaps: 0 });
  await ctx.close();
});

test("the keyboard shows only while Learn opens letters", async ({ page }) => {
  await openApp(page, { "tt.mode.en": "learn", "tt.kbHidden": "1" });
  const kb = page.locator("#keyboard");
  await expect(kb).toBeVisible();
  const card = await page.locator(".keyboard > .hands").evaluate((h) => {
    const c = getComputedStyle(h);
    return { bg: c.backgroundColor, shadow: c.boxShadow };
  });
  expect(card, "no card around the hand").toEqual({ bg: "rgba(0, 0, 0, 0)", shadow: "none" });
  await page.locator(".kb-gear").click();
  const pop = page.locator("#mini-pop");
  await expect(pop.locator(".mp-name", { hasText: /^Next key$/ })).toBeVisible();
  await expect(page.locator("#keyboard .key.next")).toHaveCount(1);
  await pop.locator('button[data-key="nextKey"][data-value=""]').click();
  await expect(page.locator("#keyboard .key.next")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("tt.nextKey"))).toBe("0");
  await page.keyboard.press("Escape");
  await expect(pop).toBeHidden();
  await page.locator("#tab-climb").click();
  await expect(kb).toBeHidden();
  await page.locator("#tab-learn").click();
  await expect(kb).toBeVisible();
  await page.request.post("/api/v1/progress?lang=en", { data: { unlockAll: true } });
  await page.reload();
  await waitForText(page);
  await expect(kb).toBeHidden();
});

test("the text stands at the same place for the same keyboard state", async ({ page }) => {
  await openApp(page, { "tt.mode.en": "learn" });
  const top = async () => Math.round((await page.locator("#text-box").boundingBox()).y);
  const learn = await top();
  let noKeyboard;
  for (const m of ["climb", "freetype", "learn"]) {
    await page.locator(`#tab-${m}`).click();
    await waitForText(page);
    await expect(page.locator("#keyboard")).toHaveClass(m === "learn" ? /^(?!.*\boff\b)/ : /\boff\b/);
    await page.waitForFunction(() => !document.getAnimations().some((a) => a.playState === "running" && a.effect?.target?.closest?.("#keyboard, #text-box, .letters")));
    if (m === "learn") expect(await top(), "the text in Learn").toBe(learn);
    else expect(await top(), `the text in ${m}`).toBe(noKeyboard ??= await top());
  }
});

test("Climb: the live numbers show from the first key, not as zeros at rest", async ({ page }) => {
  await openApp(page, { "tt.mode.en": "climb", "tt.length.climb": "words-10", "tt.live": "1" });
  const wpm = page.locator(".live > .metric.num").first();
  await expect(wpm, "no zeros before the round").toHaveCSS("opacity", "0");
  await page.keyboard.type(await nextChar(page));
  await expect(wpm, "the numbers after the first key").toHaveCSS("opacity", "1");
  await typeRound(page);
  await expectResult(page);
  await page.keyboard.press("Tab");
  await waitForText(page);
  await expect(wpm, "the last round's numbers stay until the next one starts").toHaveCSS("opacity", "1");
  await expect(wpm.locator(".live-n")).not.toHaveAttribute("data-v", "0");
});

test("Climb: the result opens in place and the round switches do not move", async ({ page }) => {
  await openApp(page, { "tt.mode.en": "climb", "tt.length.climb": "words-10" });
  const bar = page.locator("#mode-bar");
  const before = (await bar.boundingBox()).y;
  await typeRound(page);
  await expectResult(page);
  await page.waitForFunction(() => !document.getAnimations().some((a) => a.playState === "running" && a.effect?.target?.closest?.("#view-type")));
  expect((await bar.boundingBox()).y, "the bar on the result").toBeCloseTo(before, 0);
  const box = await page.locator("#result").boundingBox();
  expect(box.y + box.height, "the result fits the window").toBeLessThanOrEqual(page.viewportSize().height);
});

test("one grid in all three modes: the progress line and the round switches stand at the text edges", async ({ page }) => {
  for (const mode of ["learn", "climb", "freetype"]) {
    await openApp(page, { "tt.mode.en": mode });
    const m = await page.evaluate(() => {
      const text = document.getElementById("text").getBoundingClientRect();
      const line = document.getElementById("round-line").getBoundingClientRect();
      const right = (document.querySelector("#round-switch:not([hidden]) .ring") ?? document.querySelector("#mode-bar > .bar-side:last-child")).getBoundingClientRect();
      return { textL: text.left, textR: text.right, lineL: line.left, lineR: line.right, rightR: right.right };
    });
    expect(m.lineL, `${mode}: line starts at the text`).toBeCloseTo(m.textL, 0);
    expect(m.lineR, `${mode}: line ends at the text`).toBeCloseTo(m.textR, 0);
    expect(m.rightR, `${mode}: the round switches end at the text`).toBeCloseTo(m.textR, 0);
  }
});

for (const [w, h] of [[1920, 1080], [1366, 768]]) {
  test(`Freetype at ${w}: the switches stand on one line at the text edges, and a line shows the round`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await openApp(page, { "tt.mode.en": "freetype", "tt.length.freetype": "words-10" });
    const m = () => page.evaluate(() => {
      const text = document.getElementById("text").getBoundingClientRect();
      const sides = [...document.querySelectorAll("#mode-bar > .bar-side")].map((e) => e.getBoundingClientRect());
      const fill = document.querySelector("#round-line > i").getBoundingClientRect();
      const line = document.getElementById("round-line").getBoundingClientRect();
      return { textL: text.left, textR: text.right, sides, done: fill.width / line.width };
    });
    const at = await m();
    expect(at.sides[0].left, "the left switches start at the text").toBeCloseTo(at.textL, 0);
    expect(at.sides[1].right, "the right switches end at the text").toBeCloseTo(at.textR, 0);
    expect(at.sides[0].top, "one line").toBe(at.sides[1].top);
    expect(at.done).toBe(0);
    for (let i = 0; i < 40; i++) { const c = await nextChar(page); if (!c) break; await page.keyboard.type(c); }
    await page.waitForTimeout(400);
    expect((await m()).done, "the line fills while typing").toBeGreaterThan(0);
  });
}

test("no text on the typing, result, settings and stats screens is smaller than 14px", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openApp(page, { "tt.mode.en": "climb", "tt.length.climb": "words-10" });
  const small = () => page.evaluate(() => {
    const out = new Set();
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) {
      const el = n.parentElement;
      if (!n.textContent.trim() || !el.checkVisibility({ visibilityProperty: true }) || el.closest("#keyboard, .logo")) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 13.95) out.add(`${el.tagName.toLowerCase()}.${el.className} ${fs}px "${n.textContent.trim().slice(0, 20)}"`);
    }
    return [...out];
  });
  expect(await small(), "typing").toEqual([]);
  await typeRound(page);
  await expectResult(page);
  expect(await small(), "result").toEqual([]);
  await page.locator("#tab-stats").click();
  await expect(page.locator("#tiles > *").first()).toBeVisible();
  expect(await small(), "stats").toEqual([]);
  await openApp(page, { "tt.mode.en": "climb" });
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]").first()).toBeVisible();
  expect(await small(), "settings").toEqual([]);
});

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

test("gold text reads on the page in both themes: 4.5:1, big numbers 3:1", async ({ page }) => {
  for (const theme of ["dark", "light"]) {
    await openApp(page, { "tt.theme": theme });
    const ratio = await page.evaluate(() => {
      const rgb = (v) => {
        const probe = document.createElement("i");
        probe.style.color = `var(${v})`;
        document.body.append(probe);
        const c = getComputedStyle(probe).color.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
        probe.remove();
        return c;
      };
      const lum = (c) => c.map((x) => x / 255).map((x) => x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4)
        .reduce((s, x, i) => s + x * [.2126, .7152, .0722][i], 0);
      const on = (v) => {
        const [a, b] = [lum(rgb(v)), lum(rgb("--bg"))].sort((x, y) => y - x);
        return (a + .05) / (b + .05);
      };
      return { text: on("--accent-text"), big: on("--accent-big") };
    });
    expect(ratio.text, `${theme}: --accent-text on --bg`).toBeGreaterThanOrEqual(4.5);
    expect(ratio.big, `${theme}: --accent-big on --bg`).toBeGreaterThanOrEqual(3);
  }
});

test("stats on a phone: nothing is wider than the screen", async ({ page }) => {
  await withHistory(page);
  for (const width of [390, 375]) {
    await page.setViewportSize({ width, height: 800 });
    await openApp(page, { "tt.mode.en": "learn" });
    await page.locator("#tab-stats").click();
    await expect(page.locator("#chart svg")).toBeVisible();
    const wide = await page.evaluate(() => [...document.querySelectorAll("#view-stats *")]
      .filter((n) => n.getBoundingClientRect().right > innerWidth + 0.5)
      .map((n) => `${n.tagName.toLowerCase()}#${n.id}.${n.getAttribute("class")}`));
    expect(wide, `elements past the right edge at ${width}px`).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), "no sideways scroll").toBe(width);
  }
});

test("stats on a desktop: every tile holds its own text", async ({ page }) => {
  await page.route(/\/api\/v1\/(freeplay\/)?stats\?/, async (route) => {
    const res = await route.fetch(), body = await res.json();
    body.sessions = Array.from({ length: 20 }, (_, i) => ({ ...(body.sessions?.[0] ?? {}), wpm: 52 - i, accuracy: 96, consistency: 80 }));
    body.sessionCount = 128;
    body.streaks = [{ min: 95, longest: 14, current: 3 }, { min: 97, longest: 10, current: 3 }, { min: 100, longest: 10, current: 0 }];
    if (body.place) body.place.level = 10;
    return route.fulfill({ response: res, json: body });
  });
  for (const mode of ["climb", "learn"]) for (const [width, height] of [[1024, 768], [1366, 768], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    await openApp(page, { "tt.mode.en": mode, "tt.goal": "50" });
    await page.locator("#tab-stats").click();
    await expect(page.locator("#tiles .tile.goal")).toBeVisible();
    await expect(page.locator("#tiles")).toContainText("best 14");
    const past = () => page.evaluate(() => [...document.querySelectorAll("#tiles .tile")].flatMap((tile) => {
      const edge = tile.getBoundingClientRect().right - parseFloat(getComputedStyle(tile).paddingRight);
      return [...tile.querySelectorAll("small, b, .meta, .meta *")]
        .filter((n) => n.getBoundingClientRect().right > edge + 0.5 || n.scrollWidth > n.clientWidth + 1)
        .map((n) => `${tile.querySelector("small").textContent}: "${n.textContent}" ${n.scrollWidth}/${n.clientWidth}`);
    }));
    await expect.poll(past, { message: `text past its tile, ${mode} at ${width}px`, timeout: 3000 }).toEqual([]);
  }
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
