// Visual rewards and the start screen.

export const FX = (() => {
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const COLORS = ["#e2b714", "#8cc97a", "#7fa6e0", "#c98bd6", "#e59a62", "#5fc4c4", "#e57f8f"];

  // ---------- confetti ----------
  let canvas = null, ctx = null, parts = [], frame = 0;
  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement("canvas");
    canvas.className = "confetti";
    document.body.appendChild(canvas);
    ctx = canvas.getContext("2d");
  }
  function burst(x, y, n = 70) {
    if (reduced()) return;
    ensureCanvas();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2;
      const v = 4 + Math.random() * 6;
      parts.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        w: 4 + Math.random() * 5, h: 3 + Math.random() * 4,
        r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
        c: COLORS[i % COLORS.length], life: 0,
      });
    }
    if (!frame) frame = requestAnimationFrame(step);
  }
  function step() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter((p) => p.life < 90 && p.y < innerHeight + 20);
    for (const p of parts) {
      p.life++; p.vy += 0.22; p.vx *= 0.985;
      p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - p.life / 90);
      ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    frame = parts.length ? requestAnimationFrame(step) : 0;
    if (!frame) ctx.clearRect(0, 0, innerWidth, innerHeight);
  }
  function burstFrom(node, n) {
    const r = node.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, n);
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

  return { burst, burstFrom, bump, shake, toast, anim, collapse, fadeOut };
})();

// ---------- start screen ----------
export const Splash = (() => {
  const MIN_MS = 1750;
  const FADE_MS = 450;
  function start() {
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
      if (!skipped && wait > 0) await new Promise((r) => setTimeout(r, wait));
      const fade = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: "ease-in-out", fill: "forwards" });
      document.body.classList.remove("splashing");
      await fade.finished;
      root.remove();
    }
    return { done };
  }
  return { start };
})();
