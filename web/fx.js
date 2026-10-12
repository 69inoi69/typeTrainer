// Small visual rewards: confetti, counting numbers, bumps, a toast queue.
//
// Nothing here changes what is measured or learned; it only makes actions
// feel alive. Everything is either a CSS animation, the Web Animations API
// (element.animate, runs on the compositor) or a short canvas animation that
// runs only at the END of an exercise, never per keystroke.
// With "reduce motion" switched on in the OS, all of it is skipped.
"use strict";

const FX = (() => {
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
  // burst(x, y): n pieces fly up from (x, y) in screen pixels and fall down.
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
  // burstFrom(element): confetti from the middle of an element.
  function burstFrom(node, n) {
    const r = node.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, n);
  }

  // ---------- small animations ----------
  function countUp(node, to, ms = 650) {
    if (reduced()) { node.textContent = to; return; }
    const t0 = performance.now();
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      node.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); // ease-out
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  const anim = (node, frames, opts) => { if (node?.animate && !reduced()) node.animate(frames, opts); };
  const bump = (node, s = 1.3) => anim(node,
    [{ transform: "scale(1)" }, { transform: `scale(${s})` }, { transform: "scale(1)" }],
    { duration: 280, easing: "cubic-bezier(.3,1.6,.5,1)" });
  const shake = (node) => anim(node,
    [{ transform: "translateX(0)" }, { transform: "translateX(-5px)" }, { transform: "translateX(4px)" }, { transform: "translateX(-2px)" }, { transform: "none" }],
    { duration: 320, easing: "ease-out" });
  // squish uses the separate CSS "scale" property, so it combines with the
  // element's own transform (the switch thumb is positioned with transform)
  const squish = (node) => anim(node,
    [{ scale: "1 1" }, { scale: "1.14 .88" }, { scale: "1 1" }],
    { duration: 320, easing: "ease-out" });

  // ---------- toasts ----------
  // Messages stack in the top right corner, newest on top. Each one has a thin
  // bar that fills up while it is shown: when the bar is full (CSS animation
  // "animationend"), the message closes. Hover pauses it, a click closes it.
  const TOAST_MS = 4500;   // default time on screen
  const TOAST_MAX = 4;     // more at once: the oldest one goes away
  function toast(html, ms = TOAST_MS) {
    const box = document.getElementById("toasts");
    const node = document.createElement("div");
    node.className = "toast";
    node.setAttribute("role", "status");
    node.style.setProperty("--ms", ms + "ms");
    node.innerHTML = `<div class="toast-body">${html}</div><i class="toast-bar"></i>`;
    node.querySelector(".toast-bar").addEventListener("animationend", () => closeToast(node));
    node.addEventListener("click", () => closeToast(node));
    box.prepend(node);
    while (box.children.length > TOAST_MAX) box.lastElementChild.remove();
  }
  function closeToast(node) {
    if (node.classList.contains("out")) return;
    node.classList.add("out");             // slide-out animation, then remove
    node.addEventListener("animationend", (e) => { if (e.target === node) node.remove(); });
  }

  // true when no message is on screen (Tab messages never pile up)
  const idle = () => !document.querySelector("#toasts .toast:not(.out)");

  return { burst, burstFrom, countUp, bump, shake, squish, toast, anim, idle };
})();

// ---------- start screen ----------
// Splash.start() runs right away; splash.done() is awaited once the app has
// loaded. The splash stays at least MIN_MS so the animation can play, and any
// key or click skips the rest. The logo then flies into the header (FLIP:
// measure both positions, animate the difference) and the page slides in.
const Splash = (() => {
  const MIN_MS = 1300;
  function start() {
    const root = document.getElementById("splash");
    const t0 = performance.now();
    let skipped = false;
    const skip = () => { skipped = true; };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      root.remove(); document.body.classList.remove("splashing", "landing");
      return { done: async () => {} };
    }
    // a random phrase, never the same as last time
    let last = -1;
    try { last = Number(localStorage.getItem("tt.splash") ?? -1); } catch { /* blocked */ }
    let i = Math.floor(Math.random() * SPLASH_PHRASES);
    if (i === last) i = (i + 1) % SPLASH_PHRASES;
    try { localStorage.setItem("tt.splash", String(i)); } catch { /* blocked */ }
    document.getElementById("splash-phrase").textContent = t(`splash.${i}`);
    addEventListener("keydown", skip, { once: true });
    addEventListener("pointerdown", skip, { once: true });

    async function done() {
      const wait = MIN_MS - (performance.now() - t0);
      if (!skipped && wait > 0) await new Promise((r) => setTimeout(r, wait));
      document.getElementById("splash-bar").style.width = "100%";

      // FLIP: move the big logo onto the small header logo
      // (scale by font size, line up the left edges and the vertical centres)
      const from = document.getElementById("splash-logo");
      const text = from.querySelector(".splash-type");
      const to = document.querySelector(".top .logo");
      const a = text.getBoundingClientRect(), b = to.getBoundingClientRect();
      if (b.width > 0) {
        const s = parseFloat(getComputedStyle(to).fontSize) / parseFloat(getComputedStyle(from).fontSize);
        const f = from.getBoundingClientRect();
        const dx = b.left - a.left * 1 - (a.left - f.left) * (s - 1);
        const dy = (b.top + b.height / 2) - (f.top + (a.top - f.top + a.height / 2) * s);
        from.style.transformOrigin = "0 0";
        text.style.borderRightColor = "transparent";      // no caret on the small logo
        from.animate([{ transform: "none" },
          { transform: `translate(${dx}px, ${dy}px) scale(${s})` }],
          { duration: 520, easing: "cubic-bezier(.6,0,.2,1)", fill: "forwards" });
      }
      root.animate([{ backgroundColor: getComputedStyle(root).backgroundColor }, { backgroundColor: "transparent" }],
        { duration: 520, easing: "ease-in", fill: "forwards" });
      root.querySelectorAll(".splash-phrase, .splash-bar").forEach((n) =>
        n.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: "forwards" }));
      // typing is allowed again, but the header logo stays hidden ("landing")
      // until the flying logo has arrived, so there are never two of them
      document.body.classList.add("entering", "landing");
      document.body.classList.remove("splashing");
      await new Promise((r) => setTimeout(r, 520));
      document.body.classList.remove("landing");
      root.remove();
      setTimeout(() => document.body.classList.remove("entering"), 900);
    }
    return { done };
  }
  return { start };
})();
