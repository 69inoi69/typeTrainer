// Shared steps of the browser checks and the latency script.

export async function openApp(page, storage = {}) {
  await page.addInitScript((s) => {
    localStorage.setItem("tt.introDone", "1");
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
  }, storage);
  await page.goto("/");
  await waitForText(page);
}

export async function waitForText(page) {
  await page.waitForFunction(
    () => !document.getElementById("splash") && document.querySelectorAll("#text > span").length > 20,
    null, { timeout: 20_000 });
}

export function nextChar(page) {
  return page.evaluate(() => {
    if (document.body.classList.contains("tb-resulting")) return null;
    const s = document.querySelector("#text > span:not(.ok):not(.bad):not(.miss):not(.beyond):not(.extra)");
    return s ? s.textContent : "";
  });
}

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
