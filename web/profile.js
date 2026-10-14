// The profile in the top right corner: a placeholder for real accounts later.
// Name and picture live only in this browser (localStorage keys tt.name and
// tt.avatar); nothing is sent to the server and nothing about learning
// depends on them. "Reset" forgets them together with the other tt.* keys.
// Layer: middle. Imports only the bottom layer.

import { t } from "./i18n.js";
import { $, store } from "./state.js";

const COLORS = ["#e2b714", "#8cc97a", "#7fa6e0", "#c98bd6", "#e59a62", "#5fc4c4", "#e57f8f"];
const AVATAR_PX = 96;      // an uploaded picture is shrunk to this size: localStorage is small

const btn = $("profile-btn"), card = $("profile-card"), input = $("profile-input");
const picks = $("avatar-picks"), file = $("avatar-file");

const name = () => store.get("tt.name") || "";
// a colour ("#e2b714") or a picture ("data:image/jpeg;base64,...")
const avatar = () => store.get("tt.avatar") || COLORS[0];

// one avatar circle: the picture, or the first letter of the name on a colour
function paint(node) {
  const a = avatar();
  const photo = a.startsWith("data:");
  node.classList.toggle("photo", photo);
  node.style.backgroundImage = photo ? `url("${a}")` : "";
  node.style.setProperty("--av", photo ? "var(--sub)" : a);
  node.textContent = photo ? "" : [...(name() || t("profile.guest"))][0];
}
function paintAll() {
  $("profile-name").textContent = name() || t("profile.guest");
  paint($("avatar"));
  paint($("avatar-big"));
}

// Called at start and on every language change ("guest" is translated).
export function renderProfile() {
  input.placeholder = t("profile.guest");
  btn.title = t("profile.open");
  picks.innerHTML = COLORS.map((c) =>
    `<button type="button" data-c="${c}" style="--av:${c}" aria-label="${c}" aria-pressed="${avatar() === c}"></button>`).join("") +
    `<button type="button" class="upload" data-tip-text="${t("profile.upload")}" aria-label="${t("profile.upload")}">` +
    `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V5M7.5 9.5 12 5l4.5 4.5"/><path d="M5 19h14"/></svg></button>`;
  paintAll();
}

// ---------- open / close ----------
export const profileOpen = () => !card.hidden;
export function closeProfile() {
  card.hidden = true;
  btn.setAttribute("aria-expanded", "false");
}
function openProfile() {
  renderProfile();
  input.value = name();
  card.hidden = false;
  btn.setAttribute("aria-expanded", "true");
  input.focus();
}
btn.addEventListener("click", () => { btn.blur(); profileOpen() ? closeProfile() : openProfile(); });
// a click anywhere else closes it
document.addEventListener("pointerdown", (e) => {
  if (profileOpen() && !e.target.closest("#profile")) closeProfile();
});

// ---------- editing ----------
input.addEventListener("input", () => {
  store.set("tt.name", input.value.trim());
  paintAll();
});
input.addEventListener("keydown", (e) => { if (e.key === "Enter") closeProfile(); });
picks.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.classList.contains("upload")) { file.click(); return; }
  store.set("tt.avatar", b.dataset.c);
  renderProfile();
});
// An uploaded picture: cut to a square from the middle, shrunk to AVATAR_PX
// and kept as a small JPEG text (data URL) in localStorage.
file.addEventListener("change", () => {
  const f = file.files[0];
  file.value = "";
  if (!f) return;
  const img = new Image();
  img.onload = () => {
    const side = Math.min(img.width, img.height);
    const canvas = Object.assign(document.createElement("canvas"), { width: AVATAR_PX, height: AVATAR_PX });
    canvas.getContext("2d").drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
    URL.revokeObjectURL(img.src);
    store.set("tt.avatar", canvas.toDataURL("image/jpeg", 0.85));
    renderProfile();
  };
  img.src = URL.createObjectURL(f);
});
