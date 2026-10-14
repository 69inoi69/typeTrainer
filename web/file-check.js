// Opened by double-click (a file:// address)? Browsers do not load ES modules
// from files on disk, so app.js and the rest never run. This one small plain
// script still does: it stops the start screen and says how to open the page.
//
// The only interface text outside i18n.js: i18n.js is a module too, so it is
// not loaded here either.
"use strict";
if (location.protocol === "file:") {
  document.getElementById("splash").remove();
  document.body.classList.remove("splashing");
  document.getElementById("text").textContent =
    "Open this page through the server: run `go run .` and go to the address it prints (http://localhost:3000).";
}
