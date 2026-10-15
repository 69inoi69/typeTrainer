//go:build !(js && wasm)

// What differs between the normal server and the GitHub Pages build
// (build_wasm.go). Build tags pick one of the two files.
package main

import (
	"log"
	"os"

	"typingtrainer/internal/storage"
)

// accountsOn: the normal server can keep login cookies, so accounts work.
const accountsOn = true

// behindProxy: BEHIND_PROXY=1 says a reverse proxy (nginx, Caddy) ends
// HTTPS in front of this server (config.Config.BehindProxy).
func behindProxy() bool {
	return os.Getenv("BEHIND_PROXY") == "1"
}

// openStore: PostgreSQL if the environment variable DATABASE_URL is set,
// for example postgres://user:password@localhost:5432/typetrainer;
// otherwise the memory store (nothing to install, lost on restart).
// The address stays out of the code, so no password ends up in git.
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
