// GitHub Pages only: runs the Go app (compiled to app.wasm) inside the browser
// and sends every /api/v1/ request from app.js to it instead of to a server.
//
// app.js does not change at all: it still calls fetch("/api/v1/..."). This
// file replaces window.fetch with a version that answers those calls from Go.
// Everything else (wasm_exec.js, app.wasm, other files) goes through the real
// fetch. The build step in .github/workflows/pages.yml adds this script to
// index.html, so the normal server version never loads it.
//
// Keeping progress: the Go app keeps its data in the page's memory
// (build_wasm.go), which is gone when the tab closes. So this file saves
// each language as the same JSON that /api/v1/export gives (and Export in
// Settings writes to a file) in the browser's IndexedDB, and loads it back
// with /api/v1/import before the page's first request. A save happens after
// a round ends (the routes in SAVE_AFTER) and when the tab is hidden, not
// after every portion: an export of a long history takes a few milliseconds
// and must not land between two keypresses. Two open tabs each keep their
// own copy; the one saved last wins. When IndexedDB is blocked (some private
// windows) the site works as before and forgets on reload.
"use strict";
(function () {
  const realFetch = window.fetch.bind(window);
  // the build adds ?v=<commit> to this script; load the wasm of the same version
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
  // one IndexedDB request as a promise; null when IndexedDB is not there
  async function idb(mode, work) {
    const d = await db;
    if (!d) return null;
    return new Promise((resolve) => {
      const req = work(d.transaction(DB_STORE, mode).objectStore(DB_STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { console.error(req.error); resolve(null); };
    });
  }

  // Routes that end a round or replace data: the saved copy follows them.
  // To add a route that changes stored data: put it here (portions are left
  // out on purpose, see the header; the hidden tab catches them).
  const SAVE_AFTER = new Set([
    "/api/v1/results", "/api/v1/freeplay/results", "/api/v1/freetype/results",
    "/api/v1/progress", "/api/v1/group", "/api/v1/import",
  ]);
  const dirty = new Set(); // languages changed since their last save

  async function save(lang) {
    dirty.delete(lang);
    const out = window.goApi("GET", "/api/v1/export?lang=" + encodeURIComponent(lang), "");
    if (out.status !== 200) return console.error("typeTrainer: export", lang, out.status);
    await idb("readwrite", (s) => s.put(out.body, lang));
  }

  // Start Go (main_wasm.go fires "go-ready" once goApi exists), then load
  // the saved languages back, before any request of the page is answered.
  const ready = new Promise((resolve, reject) => {
    window.addEventListener("go-ready", resolve, { once: true });
    const go = new Go(); // from wasm_exec.js (ships with Go)
    WebAssembly.instantiateStreaming(realFetch(wasmUrl), go.importObject)
      .then((result) => go.run(result.instance))
      .catch(reject);
  }).then(async () => {
    const langs = (await idb("readonly", (s) => s.getAllKeys())) || [];
    for (const lang of langs) {
      const body = await idb("readonly", (s) => s.get(lang));
      const out = window.goApi("POST", "/api/v1/import?lang=" + encodeURIComponent(lang), body);
      // a copy the app cannot read stays in IndexedDB until the next save,
      // so a fixed version of the site can still load it
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
      // reset: drop the copy before answering, the page reloads right after
      if (route === "/api/v1/reset") await idb("readwrite", (s) => s.delete(lang));
      else if (SAVE_AFTER.has(route)) await save(lang);
      else dirty.add(lang);
    }
    return new Response(answer.body, {
      status: answer.status,
      headers: { "Content-Type": "application/json" },
    });
  };

  // a round left half way (a closed tab, a switch to another one): its
  // portions already changed the letters, keep them too
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") for (const lang of [...dirty]) save(lang);
  });
})();
