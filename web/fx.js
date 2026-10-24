// Small visual rewards: confetti, bumps, a queue of short messages, and
// the start screen (Splash).
//
// Nothing here changes what is measured or learned; it only makes actions
// feel alive. Everything is either a CSS animation, the Web Animations API
// (element.animate, runs on the compositor) or a short canvas animation that
// runs only at the END of a round, never per keystroke.
// With "reduce motion" switched on in the OS, all of it is skipped.
// Layer: bottom. Imports nothing. It does not know
// the rest of the app: callers pass it the element to animate (typing.js for
// the streak and records, tools.js for toasts, app.js for the splash).
// To add a reward effect: a function inside FX and its name in the returned
// object. It may only change how things look: never S, a sample, or anything
// sent to the server (AGENTS.md).


export const FX = (() => {
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  // confetti colours: fixed, not theme variables (a canvas cannot read CSS
  // variables cheaply, and bright pieces read on both themes)
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
  // returns the Animation (or null), so callers can wait for .finished
  const anim = (node, frames, opts) => (node?.animate && !reduced() ? node.animate(frames, opts) : null);

  // collapse(node, hide): fold an element away (height, margins, padding,
  // opacity) or unfold it, then the class "off" (display: none) is set or
  // removed. The content around it slides instead of jumping. The padding
  // folds too: left out, it stayed until display: none and the page jumped
  // by it at the end (the keyboard panel). Clicks only.
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
    try { await a.finished; } catch { return; }   // cancelled by a newer call
    node.style.overflow = "";
    if (hide) node.classList.add("off");
  }
  // fade an element out (and a little down); resolves when done
  const fadeOut = async (node, ms = 200) => {
    const a = anim(node, [{ opacity: 1 }, { opacity: 0, transform: "translateY(4px)" }], { duration: ms, easing: "ease-in" });
    if (a) { try { await a.finished; } catch { /* cancelled */ } }
  };
  // bump: a quick grow and back (the streak number); s = how big at the top
  const bump = (node, s = 1.3) => anim(node,
    [{ transform: "scale(1)" }, { transform: `scale(${s})` }, { transform: "scale(1)" }],
    { duration: 280, easing: "cubic-bezier(.3,1.6,.5,1)" });
  // shake: a short "no" from side to side (a broken streak, the reset button)
  const shake = (node) => anim(node,
    [{ transform: "translateX(0)" }, { transform: "translateX(-5px)" }, { transform: "translateX(4px)" }, { transform: "translateX(-2px)" }, { transform: "none" }],
    { duration: 320, easing: "ease-out" });

  // ---------- messages: part of the interface, not pop-ups ----------
  // A message takes the place of the top line of the text card (the live
  // numbers and the status line) for a few seconds, then the line comes
  // back. One message at a time; the others wait in a queue. A thin bar under
  // the message fills up while it is shown: when it is full (CSS animation,
  // "animationend") the next one comes. Hover pauses it, a click skips it.
  // They are only for things outside typing (a file saved or loaded): what
  // happened while typing is shown on the result screen (result.js).
  const NOTE_MS = 3500;    // time on screen
  const INFO_ICON = '<circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 8h.01"/>';
  const queue = [];
  let current = null;        // the message on screen, or null
  // toast(html): queue a message
  function toast(html) {
    queue.push({ html });
    if (!current) showNext();
  }
  function showNext() {
    const slot = document.getElementById("live");
    const box = document.getElementById("notice");
    const item = queue.shift();
    if (!item) {                         // nothing left: the status line comes back
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
    node.addEventListener("click", () => closeNote(node));
    box.replaceChildren(node);
    current = node;
    slot.classList.add("noticing");
  }
  function closeNote(node) {
    if (node !== current || node.classList.contains("out")) return;
    node.classList.add("out");           // fade out, then the next one (or the status line)
    node.addEventListener("animationend", (e) => { if (e.target === node) { node.remove(); showNext(); } });
  }

  return { burst, burstFrom, bump, shake, toast, anim, collapse, fadeOut };
})();

// ---------- start screen ----------
// Splash.start() runs right away; splash.done() is awaited once the app has
// loaded. The splash stays at least MIN_MS so the word can type itself out
// (screens.css, .splash-type), and any key or click skips the rest. Then
// the splash fades away over the page, which is already drawn under it.
// A calm fade, and nothing else moves: a page rising in piece by piece
// would restyle the whole page at the moment the fade begins, which
// stutters on a slow laptop. Only opacity is animated, so the compositor runs it
// even while the page is still busy loading.
export const Splash = (() => {
  // the icon, 11 letters at --step 85 ms from --t0 320 ms (screens.css),
  // then a short look at the whole word
  const MIN_MS = 1750;
  const FADE_MS = 450;  // the splash fading away
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
      // a timer as a wait, not an animation: it runs once, at load
      if (!skipped && wait > 0) await new Promise((r) => setTimeout(r, wait));
      const fade = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: "ease-in-out", fill: "forwards" });
      // typing is allowed at once; the page appears under the fading splash
      document.body.classList.remove("splashing");
      // the fade's own end, not a timer: on a busy slow laptop the fade
      // starts late, and the splash must not vanish before it has faded
      await fade.finished;
      root.remove();
    }
    return { done };
  }
  return { start };
})();
