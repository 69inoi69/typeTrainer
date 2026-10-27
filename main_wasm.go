//go:build js && wasm

// Entry point of the GitHub Pages build.
package main

import (
	"net/http/httptest"
	"strings"
	"syscall/js"
)

func main() {
	handler, _, err := newApp()
	if err != nil {
		js.Global().Get("console").Call("error", "typeTrainer: "+err.Error())
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

	js.Global().Call("dispatchEvent", js.Global().Get("Event").New("go-ready"))
	select {}
}
