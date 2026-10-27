// The small window next to a control, and the Ring switch groups.

import { $ } from "./state.js";

export const ringBtn = (data, label, on, tip = "") =>
  `<button type="button" ${data} aria-pressed="${on}"${tip ? ` data-tip-text="${tip}"` : ""}>${label}</button>`;
export const ring = (label, buttons) => `<span class="ring" role="group" aria-label="${label}">${buttons.join("")}</span>`;

const pop = $("mini-pop");
let draw = () => "", pick = () => {}, anchorEl = null;

function place() {
  const r = anchorEl.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
  const left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
  const top = r.bottom + 8 + h <= innerHeight ? r.bottom + 8 : Math.max(8, r.top - 8 - h);
  pop.style.left = left + "px";
  pop.style.top = top + "px";
}
export function openPop(anchor, label, drawFn, pickFn) {
  anchorEl = anchor;
  draw = drawFn;
  pick = pickFn;
  pop.setAttribute("aria-label", label);
  pop.innerHTML = draw();
  pop.showModal();
  place();
  (pop.querySelector('button[aria-pressed="true"]') ?? pop.querySelector("button"))?.focus();
  anchor.setAttribute("aria-expanded", "true");
}

pop.addEventListener("click", (e) => {
  if (e.target === pop) { pop.close(); return; }
  const b = e.target.closest("button[data-key]");
  if (!b) return;
  pick(b.dataset.key, b.dataset.value);
  pop.innerHTML = draw();
  pop.querySelector(`button[data-key="${b.dataset.key}"][aria-pressed="true"]`)?.focus();
});
pop.addEventListener("keydown", (e) => {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  const b = e.target.closest("button[data-key]");
  if (!b) return;
  e.preventDefault();
  const row = [...b.parentElement.querySelectorAll("button[data-key]")];
  row[Math.max(0, Math.min(row.length - 1, row.indexOf(b) + (e.key === "ArrowRight" ? 1 : -1)))].click();
});
pop.addEventListener("close", () => anchorEl?.setAttribute("aria-expanded", "false"));

function pickAnim(sel) {
  const on = document.querySelector(`.ring button${sel}[aria-pressed="true"]`);
  if (!on || on.classList.contains("pick")) return !!on;
  on.classList.add("pick");
  on.addEventListener("animationend", () => on.classList.remove("pick"), { once: true });
  return true;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest(".ring button");
  if (!b) return;
  const sel = [...b.attributes].filter((a) => a.name.startsWith("data-") && !a.name.startsWith("data-tip"))
    .map((a) => `[${a.name}="${CSS.escape(a.value)}"]`).join("");
  const host = b.closest(".ring").parentElement;
  const watch = new MutationObserver(() => { if (pickAnim(sel)) watch.disconnect(); });
  watch.observe(host, { childList: true, subtree: true });
  setTimeout(() => watch.disconnect(), 1500);
  requestAnimationFrame(() => { if (pickAnim(sel)) watch.disconnect(); });
}, true);
