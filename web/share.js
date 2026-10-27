// Sharing the stats screen as an image.

import { t, variantLabel } from "./i18n.js";
import { $, S, listLabel, listless } from "./state.js";
import { shownStats, summary } from "./stats.js";
import { lengthLabel } from "./settings.js";

const btnImage = $("btn-image");
const SITE = location.origin + location.pathname;

function confirm(btn, key) {
  const label = btn.querySelector("span");
  const was = label.dataset.i18n;
  label.textContent = t(key);
  btn.classList.add("done");
  btn.addEventListener("animationend", () => {
    label.textContent = t(was);
    btn.classList.remove("done");
  }, { once: true });
}

// ---------- save as an image ----------
const W = 1200, H = 630;
function drawCard() {
  const { s, length, mode, list, variant } = shownStats();
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  const mono = v("--mono"), ui = v("--ui"), logo = v("--logo");
  const canvas = document.createElement("canvas");
  canvas.width = W * 2; canvas.height = H * 2;
  const c = canvas.getContext("2d");
  c.scale(2, 2);
  c.fillStyle = v("--bg");
  c.fillRect(0, 0, W, H);
  const pad = 64;

  c.textBaseline = "alphabetic";
  c.font = `600 40px ${logo}`;
  c.fillStyle = v("--accent-text");
  c.fillText("type", pad, pad + 32);
  const tw = c.measureText("type").width;
  c.fillStyle = v("--text");
  c.fillText("Trainer", pad + tw, pad + 32);
  const title = mode === "learn" ? `${t("mode.learn")} · ${lengthLabel(length)}`
    : mode === "climb" ? `${t("mode.free")} · ${lengthLabel(length)}` : `${t("mode.freetype")} ${listless(variant) ? variantLabel(variant) : [listLabel(list), variantLabel(variant)].filter(Boolean).join(", ")} · ${lengthLabel(length)}`;
  c.font = `600 15px ${ui}`;
  c.fillStyle = v("--sub");
  c.textAlign = "right";
  c.fillText(title.toUpperCase(), W - pad, pad + 26);
  c.textAlign = "left";

  const tiles = summary(s);
  const gap = 16, tileW = (W - pad * 2 - gap * 4) / 5, tileH = 120, ty = pad + 80;
  tiles.forEach(([value, label], i) => {
    const x = pad + i * (tileW + gap);
    c.fillStyle = v("--panel");
    roundRect(c, x, ty, tileW, tileH, 12);
    c.fill();
    c.fillStyle = v("--text");
    c.font = `500 44px ${mono}`;
    c.fillText(String(value), x + 20, ty + 62);
    c.fillStyle = v("--sub");
    c.font = `600 12px ${ui}`;
    c.fillText(t(label).toUpperCase(), x + 20, ty + 96, tileW - 40);
  });

  const rounds = [...s.sessions].reverse().slice(-30);
  const cy = ty + tileH + 40, ch = H - cy - pad;
  const goal = S.settings.goal;
  const max = Math.max(goal, ...rounds.map((x) => x.wpm), 1) * 1.1;
  const slot = (W - pad * 2) / 30, bw = Math.min(26, slot - 6);
  rounds.forEach((x, i) => {
    const h = Math.max(2, (x.wpm / max) * ch);
    c.fillStyle = i === rounds.length - 1 ? v("--accent") : withAlpha(c, v("--accent"), 0.55);
    roundRect(c, pad + i * slot + (slot - bw) / 2, cy + ch - h, bw, h, 4);
    c.fill();
  });
  c.fillStyle = v("--sub");
  c.font = `600 12px ${ui}`;
  c.fillText(t("stats.speed").toUpperCase(), pad, cy - 14);
  if (goal) {
    const gy = cy + ch - (goal / max) * ch;
    c.strokeStyle = v("--sub");
    c.setLineDash([6, 6]);
    c.beginPath(); c.moveTo(pad, gy); c.lineTo(W - pad, gy); c.stroke();
    c.setLineDash([]);
    c.fillStyle = v("--sub");
    c.font = `600 12px ${ui}`;
    c.textAlign = "right";
    c.fillText(t("share.goal", { wpm: goal }).toUpperCase(), W - pad, gy - 8);
    c.textAlign = "left";
  }
  c.fillStyle = v("--sub");
  c.font = `400 13px ${mono}`;
  c.textAlign = "right";
  c.fillText(SITE.replace(/^https?:\/\//, "").replace(/\/$/, ""), W - pad, H - 24);
  return canvas;
}
function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h);
}
function withAlpha(c, color, a) {
  c.fillStyle = color;
  const hex = c.fillStyle;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

btnImage.addEventListener("click", () => {
  btnImage.blur();
  if (!shownStats().s) return;
  const canvas = drawCard();
  canvas.toBlob((blob) => {
    if (!blob) return;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `typeTrainer-${new Date().toISOString().slice(0, 10)}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    confirm(btnImage, "share.saved");
  }, "image/png");
});
