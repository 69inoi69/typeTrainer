//go:build !(js && wasm)

package main

import (
	"context"
	"io"
	"net"
	"net/http"
	"testing"
	"time"

	"typingtrainer/internal/config"
)

func TestServer_HasTimeouts(t *testing.T) {
	cfg := config.Default()
	srv := newServer(cfg, http.NotFoundHandler())
	for name, d := range map[string]time.Duration{
		"ReadHeaderTimeout": srv.ReadHeaderTimeout, "ReadTimeout": srv.ReadTimeout,
		"WriteTimeout": srv.WriteTimeout, "IdleTimeout": srv.IdleTimeout,
	} {
		if d <= 0 {
			t.Errorf("%s is %v: a slow client could hold a connection forever", name, d)
		}
	}
	if cfg.Server.Shutdown <= 0 {
		t.Errorf("Shutdown is %v", cfg.Server.Shutdown)
	}
}

// A request that is running when the stop signal comes still gets its answer.
func TestServer_StopsAfterRunningRequests(t *testing.T) {
	started, release := make(chan struct{}), make(chan struct{})
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(started)
		<-release
		io.WriteString(w, "saved")
	})
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	cfg := config.Default()
	ctx, stop := context.WithCancel(context.Background())
	served := make(chan error, 1)
	go func() { served <- serve(ctx, newServer(cfg, handler), ln, cfg.Server) }()

	answer := make(chan string, 1)
	go func() {
		res, err := http.Post("http://"+ln.Addr().String()+"/api/v1/results", "application/json", nil)
		if err != nil {
			answer <- "error: " + err.Error()
			return
		}
		body, _ := io.ReadAll(res.Body)
		res.Body.Close()
		answer <- string(body)
	}()
	<-started
	stop()
	time.Sleep(50 * time.Millisecond)
	select {
	case err := <-served:
		t.Fatalf("server stopped before the running request ended: %v", err)
	default:
	}
	close(release)
	if got := <-answer; got != "saved" {
		t.Errorf("running request got %q, want its answer", got)
	}
	select {
	case err := <-served:
		if err != nil {
			t.Errorf("serve: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("server did not stop")
	}
	if _, err := net.DialTimeout("tcp", ln.Addr().String(), time.Second); err == nil {
		t.Error("server still takes connections after the stop")
	}
}
