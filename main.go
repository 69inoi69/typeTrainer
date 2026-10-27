//go:build !(js && wasm)

// Entry point of the normal web server.
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
	log.Printf("typeTrainer running. Open http://%s in your browser", cfg.Addr)
	log.Fatal(http.ListenAndServe(cfg.Addr, handler))
}
