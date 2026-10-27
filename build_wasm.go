//go:build js && wasm

// What the GitHub Pages build sets up differently.
package main

import "typingtrainer/internal/storage"

const accountsOn = false

func behindProxy() bool { return false }

func openStore() (storage.Store, error) {
	return storage.NewMemoryStore(), nil
}
