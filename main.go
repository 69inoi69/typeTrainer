//go:build !(js && wasm)

// Entry point for running on your computer: starts a normal web server.
// (The GitHub Pages version starts in main_wasm.go instead.)
package main

import (
	"log"
	"net/http"
)

func main() {
	handler, cfg, err := newApp()
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("Typing trainer running. Open http://%s in your browser", cfg.Addr)
	log.Fatal(http.ListenAndServe(cfg.Addr, handler))
}
