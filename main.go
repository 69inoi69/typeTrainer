//go:build !(js && wasm)

// Entry point for running on your computer: starts a normal web server.
// (The GitHub Pages version starts in main_wasm.go instead.)
package main

import (
	"log"
	"net/http"
)

// main builds the app (setup.go) and serves it at cfg.Addr until the
// program is stopped.
func main() {
	handler, cfg, err := newApp()
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("typeTrainer running. Open http://%s in your browser", cfg.Addr)
	log.Fatal(http.ListenAndServe(cfg.Addr, handler))
}
