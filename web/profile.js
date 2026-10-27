// The profile card.

import { t } from "./i18n.js";
import { $, store } from "./state.js";
import { getJSON, sendAuth } from "./api.js";

const COLORS = ["#e2b714", "#8cc97a", "#7fa6e0", "#c98bd6", "#e59a62", "#5fc4c4", "#e57f8f"];
const AVATAR_PX = 96;

const btn = $("profile-btn"), card = $("profile-card"), input = $("profile-input");
const picks = $("avatar-picks"), file = $("avatar-file");
const msg = $("account-msg");

let account = { accounts: false, name: null };

const name = () => account.accounts ? account.name || "" : store.get("tt.name") || "";
const avatar = () => store.get("tt.avatar") || COLORS[0];

function paint(node) {
  const a = avatar();
  const photo = a.startsWith("data:");
  node.classList.toggle("photo", photo);
  node.style.backgroundImage = photo ? `url("${a}")` : "";
  node.style.setProperty("--av", photo ? "var(--sub)" : a);
  node.textContent = photo ? "" : [...(name() || t("profile.guest"))][0];
}
const signIn = () => account.accounts && !account.name;
const PERSON = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.6"/><path d="M5 20c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6"/></svg>`;
function paintAll() {
  btn.classList.toggle("signin", signIn());
  $("profile-name").textContent = signIn() ? t("account.login") : name() || t("profile.guest");
  paint($("avatar"));
  if (signIn()) $("avatar").innerHTML = PERSON;
  paint($("avatar-big"));
}

export async function loadAccount() {
  try {
    account = await getJSON("/auth/me", true);
  } catch (err) {
    console.error(err);
  }
  renderProfile();
}

export function renderProfile() {
  input.placeholder = t("profile.guest");
  $("profile-title").textContent = t(account.accounts ? "profile.titleAccount" : "profile.title");
  $("profile-field").hidden = account.accounts;
  $("profile-big-name").hidden = !account.accounts;
  $("profile-big-name").textContent = name() || t("profile.guest");
  $("account").hidden = !account.accounts;
  $("profile-soon").hidden = account.accounts;
  $("account-form").hidden = !!account.name;
  $("account-in").hidden = !account.name;
  if (account.name) $("account-as").innerHTML = t("account.as", { name: account.name });
  else if (!msg.classList.contains("bad")) msg.textContent = t("account.note");
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
  setMsg("");
  renderProfile();
  input.value = name();
  card.hidden = false;
  btn.setAttribute("aria-expanded", "true");
  (account.accounts ? (account.name ? null : $("account-name")) : input)?.focus();
}
btn.addEventListener("click", () => { btn.blur(); profileOpen() ? closeProfile() : openProfile(); });
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

// ---------- account ----------
function setMsg(key) {
  msg.classList.toggle("bad", !!key);
  msg.textContent = t(key || "account.note");
}
const ERRORS = { 400: "account.rules", 401: "account.wrong", 409: "account.taken", 429: "account.slow" };

$("account-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const act = e.submitter?.dataset.act === "register" ? "register" : "login";
  const body = { name: $("account-name").value, password: $("account-pass").value };
  try {
    const res = await sendAuth("POST", "/auth/" + act, body);
    if (res.status === 200) { location.reload(); return; }
    setMsg(ERRORS[res.status] || "account.fail");
  } catch (err) {
    console.error(err);
    setMsg("account.fail");
  }
});
$("account-out").addEventListener("click", async () => {
  try {
    await sendAuth("POST", "/auth/logout");
  } catch (err) {
    console.error(err);
  }
  location.reload();
});
