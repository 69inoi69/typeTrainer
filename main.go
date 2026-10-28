//go:build !(js && wasm)

// Entry point of the normal web server.
package main

import (
	"context"
	"errors"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"typingtrainer/internal/config"
)

func main() {
	handler, cfg, err := newApp()
	if err != nil {
		log.Fatal(err)
	}
	ln, err := net.Listen("tcp", cfg.Addr)
	if err != nil {
		log.Fatal(err)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	log.Printf("typeTrainer running. Open http://%s in your browser", cfg.Addr)
	if err := serve(ctx, newServer(cfg, handler), ln, cfg.Server); err != nil {
		log.Fatal(err)
	}
	log.Println("typeTrainer stopped")
}

func newServer(cfg config.Config, handler http.Handler) *http.Server {
	return &http.Server{
		Addr:              cfg.Addr,
		Handler:           handler,
		ReadHeaderTimeout: cfg.Server.ReadHeader,
		ReadTimeout:       cfg.Server.Read,
		WriteTimeout:      cfg.Server.Write,
		IdleTimeout:       cfg.Server.Idle,
	}
}

func serve(ctx context.Context, srv *http.Server, ln net.Listener, limits config.Server) error {
	done := make(chan error, 1)
	go func() {
		<-ctx.Done()
		shut, cancel := context.WithTimeout(context.Background(), limits.Shutdown)
		defer cancel()
		done <- srv.Shutdown(shut)
	}()
	if err := srv.Serve(ln); !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return <-done
}
