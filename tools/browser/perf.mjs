// The latency script (issue #144): types into the real app and prints the
// three numbers every PR that touches the typing screen reports before and
// after (AGENTS.md, "Current phase", rule 4):
//   style recalc per key  the time the browser spent restyling the page
//                         while typing, divided by the keys (CDP Performance
//                         metrics); at full CPU speed, where the goal is
//                         under 2 ms for the screen itself (--bare)
//   key -> caret start    from the keydown to the caret starting to move
//                         (the first change of its style), median; CPU
//                         slowed 6x, a weak laptop
//   slow frames           share of animation frames longer than 25 ms
//                         while typing; CPU slowed 6x
// Run it from this folder with the server already running on the code you
// want to measure (go:embed bakes web/ into the binary: restart the server
// after every change):
//   node perf.mjs                      Learn, 80 ms between keys
//   node perf.mjs --mode climb --runs 5 --slow 4
//   node perf.mjs --bare               the screen itself: no falling
//                                      background, no keyboard (the
//                                      2 ms goal is for this)
// Numbers depend on the machine: compare before/after on the same one.
// To add a metric: collect it in the page in setupProbes, print it in report.
import { chromium } from "@playwright/test";
import { openApp } from "./app.mjs";

const args = Object.fromEntries(process.argv.slice(2).join(" ").split("--").filter(Boolean)
  .map((a) => a.trim().split(/\s+/)).map(([k, v]) => [k, v ?? "1"]));
const opt = {
  url: args.url ?? "http://localhost:3000",
  mode: args.mode ?? "learn",          // learn, climb or freetype
  slow: Number(args.slow ?? 6),        // CPU slowdown for the caret and the frames
  delay: Number(args.delay ?? 80),     // ms between keys (80 ms = 150 wpm)
  keys: Number(args.keys ?? 50),       // keys typed per run
  runs: Number(args.runs ?? 3),        // the median of the runs is printed
  bare: "bare" in args,                // background and keyboard off
};

// In the page: the keydown times, the caret's style changes and the frame
// lengths. Installed after the page has loaded, so loading is not counted.
function setupProbes() {
  const W = window.__perf = { keys: [], moves: [], frames: [] };
  addEventListener("keydown", (e) => W.keys.push(e.timeStamp), true);
  new MutationObserver(() => W.moves.push(performance.now()))
    .observe(document.getElementById("caret"), { attributes: true, attributeFilter: ["style", "class"] });
  let last = 0;
  const frame = (t) => { if (last) W.frames.push(t - last); last = t; requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };

async function oneRun(browser, cpu) {
  const ctx = await browser.newContext({ baseURL: opt.url, viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const bare = opt.bare ? { "tt.bg": "off", "tt.kbHidden": "1", "tt.kbHidden.free": "1" } : {};
  await openApp(page, { "tt.mode.en": opt.mode, "tt.length.learn": "words-30", [`tt.length.${opt.mode}`]: "words-30", ...bare });
  await page.waitForFunction((n) => document.querySelectorAll("#text > span").length > n, opt.keys + 1, { timeout: 20_000 });
  await page.waitForTimeout(800);   // let the first round's entrance settle
  const text = await page.evaluate(() => [...document.querySelectorAll("#text > span")].map((s) => s.textContent).join(""));

  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Performance.enable");
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  await page.evaluate(setupProbes);
  const recalc = async () => (await cdp.send("Performance.getMetrics")).metrics
    .find((m) => m.name === "RecalcStyleDuration").value;
  const before = await recalc();
  for (const ch of text.slice(0, opt.keys)) {
    await page.keyboard.type(ch);
    await page.waitForTimeout(opt.delay);
  }
  await page.waitForTimeout(400);
  const after = await recalc();
  const W = await page.evaluate(() => window.__perf);
  await ctx.close();

  const lags = [];
  let j = 0;
  for (const k of W.keys) {
    while (j < W.moves.length && W.moves[j] < k) j++;
    if (j < W.moves.length) lags.push(W.moves[j] - k);
  }
  return {
    recalc: ((after - before) * 1000) / opt.keys,        // seconds -> ms, per key
    caret: median(lags),
    slow: W.frames.filter((f) => f > 25).length / W.frames.length,
  };
}

// two sets of runs: full speed for the style recalc, slowed for the rest
const browser = await chromium.launch();
const fast = [], slow = [];
for (let i = 0; i < opt.runs; i++) fast.push(await oneRun(browser, 1));
for (let i = 0; i < opt.runs; i++) slow.push(await oneRun(browser, opt.slow));
await browser.close();

const fmt = (x, d = 1) => x.toFixed(d);
console.log(`mode ${opt.mode}${opt.bare ? " (bare: no background, no keyboard)" : ""}, ${opt.keys} keys every ${opt.delay} ms, median of ${opt.runs} runs`);
console.log(`  style recalc per key   ${fmt(median(fast.map((r) => r.recalc)))} ms   (full speed)`);
console.log(`  key -> caret start     ${fmt(median(slow.map((r) => r.caret)), 0)} ms    (CPU ${opt.slow}x slower)`);
console.log(`  slow frames (>25 ms)   ${fmt(median(slow.map((r) => r.slow)) * 100, 0)}%    (CPU ${opt.slow}x slower)`);
