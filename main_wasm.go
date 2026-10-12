//go:build js && wasm

// Entry point for the GitHub Pages version.
//
// GitHub Pages can only host static files, it cannot run a Go server. So this
// file compiles the WHOLE app (engine, store, API handlers) to WebAssembly,
// which runs inside the browser. Instead of listening on a port, it gives
// JavaScript one function:
//
//	goApi(method, path, body) -> {status, body}
//
// pages/wasm-shim.js sends every /api/v1/ request from app.js to that
// function. The handlers answer exactly as the real server would; httptest
// is only used as a convenient in-memory request/response pair.
package main

import (
	"net/http/httptest"
	"strings"
	"syscall/js"
)

func main() {
	handler, _, err := newApp()
	if err != nil {
		js.Global().Get("console").Call("error", "typing trainer: "+err.Error())
		return
	}

	js.Global().Set("goApi", js.FuncOf(func(this js.Value, args []js.Value) any {
		if len(args) < 3 {
			return map[string]any{"status": 400, "body": `{"error":"goApi needs method, path, body"}`}
		}
		req := httptest.NewRequest(args[0].String(), args[1].String(), strings.NewReader(args[2].String()))
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		return map[string]any{"status": rec.Code, "body": rec.Body.String()}
	}))

	// Tell the page we are ready, then keep the Go program alive forever:
	// if main returned, goApi would stop working.
	js.Global().Call("dispatchEvent", js.Global().Get("Event").New("go-ready"))
	select {}
}
