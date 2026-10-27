// Server calls.

import { S } from "./state.js";

export const API = "/api/v1";

// ---------- server calls ----------
function withLang(path, lang = S.lang) {
  return path + (path.includes("?") ? "&" : "?") + "lang=" + encodeURIComponent(lang);
}
export async function getJSON(path, global = false) {
  const res = await fetch(API + (global ? path : withLang(path)));
  if (!res.ok) throw new Error(path + " -> " + res.status);
  return res.json();
}
export async function sendAuth(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
export async function postJSON(path, body, lang = S.lang) {
  let res;
  try {
    res = await fetch(API + withLang(path, lang), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw Object.assign(new Error(path + " -> no connection: " + err.message), { status: 0 });
  }
  if (!res.ok) throw Object.assign(new Error(path + " -> " + res.status), { status: res.status });
  return res.json();
}

export const retryable = (err) => !(err.status >= 400 && err.status < 500);

const SAVE_RETRY_MS = [1000, 3000];
export async function saveRound(path, body) {
  for (let i = 0; ; i++) {
    try {
      return await postJSON(path, body);
    } catch (err) {
      if (i >= SAVE_RETRY_MS.length || !retryable(err)) throw err;
      await new Promise((r) => setTimeout(r, SAVE_RETRY_MS[i]));
    }
  }
}
