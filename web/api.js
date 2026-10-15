// Talking to the server: every route starts with /api/v1/. On GitHub Pages
// the same calls are answered by the Go code compiled to WebAssembly
// (pages/wasm-shim.js replaces fetch), so nothing here knows the difference.
// Layer: bottom. Imports only state.js (for the current language).

import { S } from "./state.js";

export const API = "/api/v1";

// ---------- server calls ----------
// Every call except /languages and /auth/* is about one language: add ?lang= to it.
function withLang(path, lang = S.lang) {
  return path + (path.includes("?") ? "&" : "?") + "lang=" + encodeURIComponent(lang);
}
// GET a route and return its JSON; throws on an error status.
// global = true: a route that is not about one language (no ?lang=).
export async function getJSON(path, global = false) {
  const res = await fetch(API + (global ? path : withLang(path)));
  if (!res.ok) throw new Error(path + " -> " + res.status);
  return res.json();
}
// For the account routes (/auth/*): no ?lang=, and an error answer is not
// thrown but returned, so the profile can say what went wrong.
// -> {status, data}
export async function sendAuth(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
// lang: another language than the current one (the study link sets all).
export async function postJSON(path, body, lang = S.lang) {
  const res = await fetch(API + withLang(path, lang), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(path + " -> " + res.status);
  return res.json();
}
