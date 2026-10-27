// GitHub Pages only: answers /api/v1/ requests from the Go app compiled to
// WebAssembly.
"use strict";
(function () {
  const realFetch = window.fetch.bind(window);
  const version = new URL(document.currentScript.src).searchParams.get("v");
  const wasmUrl = "app.wasm" + (version ? "?v=" + version : "");

  // ---------- IndexedDB: one record per language, key = ?lang= ----------
  const DB_NAME = "typetrainer", DB_STORE = "progress";
  const db = new Promise((resolve) => {
    try {
      const open = indexedDB.open(DB_NAME, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(DB_STORE);
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  async function idb(mode, work) {
    const d = await db;
    if (!d) return null;
    return new Promise((resolve) => {
      const req = work(d.transaction(DB_STORE, mode).objectStore(DB_STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { console.error(req.error); resolve(null); };
    });
  }

  const SAVE_AFTER = new Set([
    "/api/v1/results", "/api/v1/freeplay/results", "/api/v1/freetype/results",
    "/api/v1/progress", "/api/v1/group", "/api/v1/import",
  ]);
  const dirty = new Set();

  async function save(lang) {
    dirty.delete(lang);
    const out = window.goApi("GET", "/api/v1/export?lang=" + encodeURIComponent(lang), "");
    if (out.status !== 200) return console.error("typeTrainer: export", lang, out.status);
    await idb("readwrite", (s) => s.put(out.body, lang));
  }

  const ready = new Promise((resolve, reject) => {
    window.addEventListener("go-ready", resolve, { once: true });
    const go = new Go();
    WebAssembly.instantiateStreaming(realFetch(wasmUrl), go.importObject)
      .then((result) => go.run(result.instance))
      .catch(reject);
  }).then(async () => {
    const langs = (await idb("readonly", (s) => s.getAllKeys())) || [];
    for (const lang of langs) {
      const body = await idb("readonly", (s) => s.get(lang));
      const out = window.goApi("POST", "/api/v1/import?lang=" + encodeURIComponent(lang), body);
      if (out.status !== 200) console.error("typeTrainer: restore", lang, out.status, out.body);
    }
  });

  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    const at = url.pathname.indexOf("/api/v1/");
    if (at === -1) return realFetch(input, options);

    await ready;
    const route = url.pathname.slice(at);
    const method = options.method || "GET";
    const answer = window.goApi(method, route + url.search, options.body || "");
    if (method === "POST" && answer.status === 200) {
      const lang = url.searchParams.get("lang") || "";
      if (route === "/api/v1/reset") await idb("readwrite", (s) => s.delete(lang));
      else if (SAVE_AFTER.has(route)) await save(lang);
      else dirty.add(lang);
    }
    return new Response(answer.body, {
      status: answer.status,
      headers: { "Content-Type": "application/json" },
    });
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") for (const lang of [...dirty]) save(lang);
  });
})();
