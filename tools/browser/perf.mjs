// The latency script: node perf.mjs [--mode climb] [--runs 5] [--slow 4]
// [--bare].
import { chromium } from "@playwright/test";
import { openApp, waitForText } from "./app.mjs";

const args = Object.fromEntries(process.argv.slice(2).join(" ").split("--").filter(Boolean)
  .map((a) => a.trim().split(/\s+/)).map(([k, v]) => [k, v ?? "1"]));
const opt = {
  url: args.url ?? "http://localhost:3000",
  mode: args.mode ?? "learn",
  slow: Number(args.slow ?? 6),
  delay: Number(args.delay ?? 80),
  keys: Number(args.keys ?? 50),
  runs: Number(args.runs ?? 3),
  bare: "bare" in args,
};

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
  const bare = opt.bare ? { "tt.bg": "off", "tt.kbHidden": "1", "tt.kbHidden.free": "1" } : { "tt.bg": "keys" };
  await openApp(page, { "tt.mode.en": opt.mode, "tt.length.learn": "words-30", [`tt.length.${opt.mode}`]: "words-30", ...bare });
  if (opt.bare && opt.mode === "learn") {
    await page.request.post("/api/v1/progress?lang=en", { data: { unlockAll: true } });
    await page.reload();
    await waitForText(page);
  }
  await page.waitForFunction((n) => document.querySelectorAll("#text > span").length > n, opt.keys + 1, { timeout: 20_000 });
  await page.waitForTimeout(800);
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
    recalc: ((after - before) * 1000) / opt.keys,
    caret: median(lags),
    slow: W.frames.filter((f) => f > 25).length / W.frames.length,
  };
}

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
