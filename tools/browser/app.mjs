// Shared steps of the browser checks and the latency script: open the app
// the way a returning visitor sees it, read the next letter to type, type a
// whole round. Kept in one place so the checks and perf.mjs type the same way.

// The settings a test starts with, as the app keeps them in localStorage
// (keys "tt.*", see web/settings.js and web/modes.js). The first-visit
// guide is marked as seen so it does not cover the text.
export async function openApp(page, storage = {}) {
  await page.addInitScript((s) => {
    localStorage.setItem("tt.introDone", "1");
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
  }, storage);
  await page.goto("/");
  await waitForText(page);
}

// The text of a round is on screen and the start splash (web/fx.js) is gone:
// keys pressed before that would skip the splash, not type.
export async function waitForText(page) {
  await page.waitForFunction(
    () => !document.getElementById("splash") && document.querySelectorAll("#text > span").length > 20,
    null, { timeout: 20_000 });
}

// The next letter to type: the first one not typed yet. Letters already
// typed carry ok / bad / miss (web/typing.js setState); words after the end
// of the round carry "beyond". null when the result is open, "" while the
// next words are still loading (Learn fetches them as you type).
export function nextChar(page) {
  return page.evaluate(() => {
    if (document.body.classList.contains("tb-resulting")) return null;
    const s = document.querySelector("#text > span:not(.ok):not(.bad):not(.miss):not(.beyond):not(.extra)");
    return s ? s.textContent : "";
  });
}

// Types the round without mistakes until done() says it is over: by default
// when the result opens (Climb, Freetype; Learn has no result screen and
// starts its next round at once, so its test passes its own done). delay is the gap
// between keys in ms: 70 is about 170 wpm, fast but human (above 400 wpm
// the server rejects the round, internal/api/validate.go). afterKey runs
// after every key, for checks while typing.
export async function typeRound(page, { delay = 70, afterKey, done } = {}) {
  for (let i = 0; i < 600; i++) {
    if (done && await done()) return;
    const ch = await nextChar(page);
    if (ch === null) return;
    if (ch === "") { await page.waitForTimeout(50); continue; }
    await page.keyboard.type(ch);
    if (afterKey) await afterKey();
    await page.waitForTimeout(delay);
  }
  throw new Error("the round did not end after 600 steps");
}
