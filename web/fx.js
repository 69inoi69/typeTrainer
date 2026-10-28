// Visual rewards and the start screen.

export const FX = (() => {
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- a wave of light along the letters row ----------
  function wave(row) {
    if (reduced() || !row) return;
    [...row.children].forEach((chip, i) => {
      const glow = document.createElement("i");
      glow.className = "wave";
      glow.style.setProperty("--i", i);
      glow.addEventListener("animationend", () => glow.remove(), { once: true });
      chip.append(glow);
    });
  }

  // ---------- trading-card foil over a number or a word ----------
  function foil(node) {
    const cs = getComputedStyle(node), w = node.offsetWidth, h = node.offsetHeight;
    if (!w || !h) return;
    const dpr = devicePixelRatio || 1, canvas = document.createElement("canvas");
    canvas.width = Math.ceil(w * dpr);
    canvas.height = Math.ceil(h * dpr);
    const g = canvas.getContext("2d");
    g.scale(dpr, dpr);
    g.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    g.letterSpacing = cs.letterSpacing;
    const text = node.firstChild?.nodeType === 3 ? node.firstChild.textContent : node.textContent;
    const m = g.measureText(text);
    const padT = parseFloat(cs.paddingTop), inner = h - padT - parseFloat(cs.paddingBottom);
    const base = padT + (inner - m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2 + m.fontBoundingBoxAscent;
    g.fillText(text, parseFloat(cs.paddingLeft), base);
    node.style.setProperty("--foil-mask", `url(${canvas.toDataURL()})`);
    node.classList.add("foil");
    node.insertAdjacentHTML("beforeend", `<i class="foil-sheen" aria-hidden="true"></i><i class="foil-glare" aria-hidden="true"></i>`);
  }

  // ---------- small animations ----------
  const anim = (node, frames, opts) => (node?.animate && !reduced() ? node.animate(frames, opts) : null);

  async function collapse(node, hide, ms = 240) {
    if (reduced() || !node.animate) { node.classList.toggle("off", hide); return; }
    node.getAnimations().forEach((a) => a.cancel());
    if (!hide) node.classList.remove("off");
    const cs = getComputedStyle(node);
    const open = { height: node.offsetHeight + "px", marginTop: cs.marginTop, marginBottom: cs.marginBottom,
      paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, opacity: 1 };
    const shut = { height: "0px", marginTop: "0px", marginBottom: "0px", paddingTop: "0px", paddingBottom: "0px", opacity: 0 };
    node.style.overflow = "hidden";
    const a = node.animate(hide ? [open, shut] : [shut, open], { duration: ms, easing: "cubic-bezier(.2,.8,.2,1)" });
    try { await a.finished; } catch { return; }
    node.style.overflow = "";
    if (hide) node.classList.add("off");
  }
  const fadeOut = async (node, ms = 200) => {
    const a = anim(node, [{ opacity: 1 }, { opacity: 0, transform: "translateY(4px)" }], { duration: ms, easing: "ease-in" });
    if (a) { try { await a.finished; } catch {} }
  };
  const bump = (node, s = 1.3) => anim(node,
    [{ transform: "scale(1)" }, { transform: `scale(${s})` }, { transform: "scale(1)" }],
    { duration: 280, easing: "cubic-bezier(.3,1.6,.5,1)" });
  const shake = (node) => anim(node,
    [{ transform: "translateX(0)" }, { transform: "translateX(-5px)" }, { transform: "translateX(4px)" }, { transform: "translateX(-2px)" }, { transform: "none" }],
    { duration: 320, easing: "ease-out" });

  // ---------- messages: part of the interface, not pop-ups ----------
  const NOTE_MS = 3500;
  const INFO_ICON = '<circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 8h.01"/>';
  const queue = [];
  let current = null;
  function toast(html, act) {
    queue.push({ html, act });
    if (!current) showNext();
  }
  function showNext() {
    const slot = document.getElementById("live");
    const box = document.getElementById("notice");
    const item = queue.shift();
    if (!item) {
      current = null;
      slot.classList.remove("noticing");
      return;
    }
    const node = document.createElement("div");
    node.className = "note";
    node.style.setProperty("--ms", NOTE_MS + "ms");
    const mark = document.createElement("span");
    mark.className = "note-mark";
    mark.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${INFO_ICON}</svg>`;
    node.innerHTML = `<span class="note-body">${item.html}</span><i class="note-bar"></i>`;
    node.prepend(mark);
    node.querySelector(".note-bar").addEventListener("animationend", () => closeNote(node));
    if (item.act) node.querySelector(".note-act")?.addEventListener("click", item.act);
    node.addEventListener("click", () => closeNote(node));
    box.replaceChildren(node);
    current = node;
    slot.classList.add("noticing");
  }
  function closeNote(node) {
    if (node !== current || node.classList.contains("out")) return;
    node.classList.add("out");
    node.addEventListener("animationend", (e) => { if (e.target === node) { node.remove(); showNext(); } });
  }

  return { wave, foil, bump, shake, toast, anim, collapse, fadeOut };
})();

// ---------- start screen ----------
export const Splash = (() => {
  const MIN_MS = 1750;
  const FADE_MS = 450;
  const AGAIN_FADE_MS = 150;
  function start(firstVisit) {
    const root = document.getElementById("splash");
    const t0 = performance.now();
    let skipped = false;
    const skip = () => { skipped = true; };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      root.remove(); document.body.classList.remove("splashing");
      return { done: async () => {} };
    }
    addEventListener("keydown", skip, { once: true });
    addEventListener("pointerdown", skip, { once: true });

    async function done() {
      const wait = MIN_MS - (performance.now() - t0);
      if (firstVisit && !skipped && wait > 0) await new Promise((r) => setTimeout(r, wait));
      const fade = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: firstVisit ? FADE_MS : AGAIN_FADE_MS, easing: "ease-in-out", fill: "forwards" });
      document.body.classList.remove("splashing");
      await fade.finished;
      root.remove();
    }
    return { done };
  }
  return { start };
})();
