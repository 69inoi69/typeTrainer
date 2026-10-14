// Small visual rewards: confetti, counting numbers, bumps, a toast queue.
//
// Nothing here changes what is measured or learned; it only makes actions
// feel alive. Everything is either a CSS animation, the Web Animations API
// (element.animate, runs on the compositor) or a short canvas animation that
// runs only at the END of an exercise, never per keystroke.
// With "reduce motion" switched on in the OS, all of it is skipped.

import { SPLASH_PHRASES, t } from "./i18n.js";

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

  // ---------- scoreboard numbers ----------
  // roll(node, n) shows the whole number n in node like a scoreboard: every
  // digit is a column 0...9 (class .odo-d) and CSS slides it to its digit
  // (style.css, transition on transform). Called on every keypress, so it only
  // sets a CSS variable on the digits that changed; the columns are rebuilt
  // only when the number gets a digit more or less. Screen readers get the
  // plain number from a hidden span.
  const DIGITS = "<b>0</b><b>1</b><b>2</b><b>3</b><b>4</b><b>5</b><b>6</b><b>7</b><b>8</b><b>9</b>";
  function roll(node, n) {
    const str = String(Math.max(0, Math.round(n)));
    if (node.dataset.v === str) return;
    node.dataset.v = str;
    let odo = node.querySelector(".odo");
    if (!odo || odo.children.length !== str.length) {
      odo = document.createElement("span");
      odo.className = "odo";
      odo.setAttribute("aria-hidden", "true");
      odo.innerHTML = `<span class="odo-d"><i>${DIGITS}</i></span>`.repeat(str.length);
      const label = Object.assign(document.createElement("span"), { className: "sr-only" });
      node.replaceChildren(odo, label);
    }
    [...odo.children].forEach((d, i) => d.firstChild.style.setProperty("--v", str[i]));
    node.lastChild.textContent = str;
  }

  // ---------- small animations ----------
  // returns the Animation (or null), so callers can wait for .finished
  const anim = (node, frames, opts) => (node?.animate && !reduced() ? node.animate(frames, opts) : null);

  // collapse(node, hide): fold an element away (height, margins, opacity) or
  // unfold it, then the class "off" (display: none) is set or removed. The
  // content around it slides instead of jumping. Called on clicks only.
  async function collapse(node, hide, ms = 240) {
    if (reduced() || !node.animate) { node.classList.toggle("off", hide); return; }
    node.getAnimations().forEach((a) => a.cancel());
    if (!hide) node.classList.remove("off");
    const cs = getComputedStyle(node);
    const open = { height: node.offsetHeight + "px", marginTop: cs.marginTop, marginBottom: cs.marginBottom, opacity: 1 };
    const shut = { height: "0px", marginTop: "0px", marginBottom: "0px", opacity: 0 };
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
  const bump = (node, s = 1.3) => anim(node,
    [{ transform: "scale(1)" }, { transform: `scale(${s})` }, { transform: "scale(1)" }],
    { duration: 280, easing: "cubic-bezier(.3,1.6,.5,1)" });
  const shake = (node) => anim(node,
    [{ transform: "translateX(0)" }, { transform: "translateX(-5px)" }, { transform: "translateX(4px)" }, { transform: "translateX(-2px)" }, { transform: "none" }],
    { duration: 320, easing: "ease-out" });

  // ---------- messages: part of the interface, not pop-ups ----------
  // A message takes the place of the status line under the letters (focus /
  // mastered letters / next) for a few seconds, then the status line comes
  // back. One message at a time; the others wait in a queue. A thin bar under
  // the message fills up while it is shown: when it is full (CSS animation,
  // "animationend") the next one comes. Hover pauses it, a click skips it.
  //
  // All messages look like the rest of the page; every KIND has its own icon,
  // a small icon animation and the colour of the time bar (style.css,
  // .note.k-<kind>), so you can tell what happened at a glance:
  //   best     new personal record       gold bar, trophy, shine
  //   letter   a new letter opened       blue bar, the letter itself pops in
  //   mastered letters mastered          green bar, a check that draws itself
  //   streak   clean words in a row      orange bar, a zapping bolt
  //   resisted Tab urges beaten          violet bar, shield
  //   tab      message after Tab         grey bar, small and quick
  //   tip      a typing tip or a joke    teal bar, a light bulb
  const NOTE_MS = 3500;    // default time on screen
  const ICONS = {
    best: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4M8 20h8"/>',
    mastered: '<path class="draw" d="M5 12.5l4.5 4.5L19 7.5"/>',
    streak: '<path d="M13.5 2.5 5 13.5h6l-1 8 8.5-11h-6z"/>',
    resisted: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
    tab: '<path d="M4 12h11M11 8l4 4-4 4M19 6v12"/>',
    tip: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    info: '<circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 8h.01"/>',
  };
  const KIND_MS = { best: 4500, letter: 6500, tab: 2400, tip: 6000 };
  const queue = [];
  let current = null;        // the message on screen, or null
  // toast(html) or toast(html, {kind, ms, badge}); badge = a letter instead of the icon
  function toast(html, opts = {}) {
    queue.push({ html, opts });
    if (!current) showNext();
  }
  function showNext() {
    const slot = document.getElementById("caption-slot");
    const box = document.getElementById("notice");
    const item = queue.shift();
    if (!item) {                         // nothing left: the status line comes back
      current = null;
      slot.classList.remove("noticing");
      return;
    }
    const kind = item.opts.kind || "info";
    const node = document.createElement("div");
    node.className = "note k-" + kind;
    node.style.setProperty("--ms", (item.opts.ms ?? KIND_MS[kind] ?? NOTE_MS) + "ms");
    const mark = document.createElement("span");
    mark.className = "note-mark";
    if (item.opts.badge) mark.textContent = item.opts.badge;
    else mark.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[kind] || ICONS.info}</svg>`;
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

  // true when no message is shown or waiting (Tab messages never pile up)
  const idle = () => !current && !queue.length;

  return { burst, burstFrom, roll, bump, shake, toast, anim, idle, collapse, fadeOut };
})();

// ---------- start screen ----------
// Splash.start() runs right away; splash.done() is awaited once the app has
// loaded. The splash stays at least MIN_MS so the animation can play, and any
// key or click skips the rest. The logo then flies into the header (FLIP:
// measure both positions, animate the difference) and the page slides in.
export const Splash = (() => {
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
      // FLIP: move the big logo onto the small header logo
      // (scale by font size, line up the left edges and the vertical centres)
      const from = document.getElementById("splash-logo");
      const text = from.querySelector(".splash-type");
      const to = document.querySelector(".top .logo-name");
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
      } else {
        // phone: the header has no logo to land on, so the big one simply
        // drifts up a little, shrinks slightly and fades out
        from.style.transformOrigin = "50% 50%";
        from.animate([{ opacity: 1, transform: "none" },
          { opacity: 0, transform: "translateY(-14px) scale(.94)" }],
          { duration: 420, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" });
      }
      root.animate([{ backgroundColor: getComputedStyle(root).backgroundColor }, { backgroundColor: "transparent" }],
        { duration: 520, easing: "ease-in", fill: "forwards" });
      // the phrase flies onto the small motto over the header logo (same text);
      // on phones (no logo in the header) it just fades out
      const phrase = document.getElementById("splash-phrase");
      const motto = document.querySelector(".top .logo-motto");
      const textBox = (node) => { const r = document.createRange(); r.selectNodeContents(node); return r.getBoundingClientRect(); };
      const ma = motto ? textBox(motto) : null;
      if (b.width > 0 && ma && ma.width > 0) {
        const pa = textBox(phrase), pf = phrase.getBoundingClientRect();
        const ps = parseFloat(getComputedStyle(motto).fontSize) / parseFloat(getComputedStyle(phrase).fontSize);
        phrase.style.transformOrigin = `${pa.left - pf.left}px ${pa.top - pf.top}px`;   // the text's top-left corner
        phrase.animate([{ transform: "none" },
          { transform: `translate(${ma.left - pa.left}px, ${ma.top - pa.top}px) scale(${ps})` }],
          { duration: 520, easing: "cubic-bezier(.6,0,.2,1)", fill: "forwards" });
      } else {
        phrase.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: "forwards" });
      }
      // typing is allowed again, but the header logo stays hidden ("landing")
      // until the flying logo has arrived, so there are never two of them
      document.body.classList.add("entering", "landing");
      document.body.classList.remove("splashing");
      await new Promise((r) => setTimeout(r, 520));
      document.body.classList.remove("landing");
      root.remove();
      setTimeout(() => document.body.classList.remove("entering"), 900);
    }
    return { done, phrase: i };   // the app shows the same phrase over the logo
  }
  return { start };
})();
