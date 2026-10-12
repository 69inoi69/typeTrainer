// GitHub Pages only: runs the Go app (compiled to app.wasm) inside the browser
// and sends every /api/v1/ request from app.js to it instead of to a server.
//
// app.js does not change at all: it still calls fetch("/api/v1/..."). This
// file replaces window.fetch with a version that answers those calls from Go.
// Everything else (wasm_exec.js, app.wasm, other files) goes through the real
// fetch. The build step in .github/workflows/pages.yml adds this script to
// index.html, so the normal server version never loads it.
"use strict";
(function () {
  const realFetch = window.fetch.bind(window);
  // the build adds ?v=<commit> to this script; load the wasm of the same version
  const version = new URL(document.currentScript.src).searchParams.get("v");
  const wasmUrl = "app.wasm" + (version ? "?v=" + version : "");

  // Start Go. main_wasm.go fires "go-ready" once goApi exists.
  const ready = new Promise((resolve, reject) => {
    window.addEventListener("go-ready", resolve, { once: true });
    const go = new Go(); // from wasm_exec.js (ships with Go)
    WebAssembly.instantiateStreaming(realFetch(wasmUrl), go.importObject)
      .then((result) => go.run(result.instance))
      .catch(reject);
  });

  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    const at = url.pathname.indexOf("/api/v1/");
    if (at === -1) return realFetch(input, options);

    await ready;
    const path = url.pathname.slice(at) + url.search;
    const answer = window.goApi(options.method || "GET", path, options.body || "");
    return new Response(answer.body, {
      status: answer.status,
      headers: { "Content-Type": "application/json" },
    });
  };
})();
