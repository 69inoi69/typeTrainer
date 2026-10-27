//go:build !(js && wasm)

// What the normal server build sets up differently.
package main

import (
	"log"
	"os"

	"typingtrainer/internal/storage"
)

const accountsOn = true

func behindProxy() bool {
	return os.Getenv("BEHIND_PROXY") == "1"
}

func openStore() (storage.Store, error) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		log.Println("storage: memory (set DATABASE_URL to keep data in PostgreSQL)")
		return storage.NewMemoryStore(), nil
	}
	p, err := storage.OpenPostgres(url)
	if err != nil {
		return nil, err
	}
	log.Println("storage: PostgreSQL")
	return p, nil
}
