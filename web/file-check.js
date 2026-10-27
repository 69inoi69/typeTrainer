// Shown when the page is opened from disk instead of the server.
"use strict";
if (location.protocol === "file:") {
  document.getElementById("splash").remove();
  document.body.classList.remove("splashing");
  document.getElementById("text").textContent =
    "Open this page through the server: run `go run .` and go to the address it prints (http://localhost:3000).";
}
