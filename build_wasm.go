//go:build js && wasm

// What differs on GitHub Pages (see build_server.go for the normal server).
package main

import "typingtrainer/internal/storage"

// accountsOn: on GitHub Pages the Go code answers requests inside the page
// (main_wasm.go), with no cookies at all, so accounts cannot work there.
// /api/v1/auth/me says so and the page shows no login form.
const accountsOn = false

// openStore: a browser has no database; the data lives in the page's memory.
func openStore() (storage.Store, error) {
	return storage.NewMemoryStore(), nil
}
