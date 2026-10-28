// Package static serves the embedded web files with an ETag and gzip.
package static

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"strconv"
	"strings"
	"sync"
	"time"
)

var zipped = map[string]bool{".html": true, ".css": true, ".js": true, ".json": true, ".svg": true, ".txt": true}

type file struct {
	plain, gz    []byte
	etag, etagGz string
	contentType  string
}

type Handler struct {
	fsys  fs.FS
	next  http.Handler
	mu    sync.Mutex
	files map[string]*file
}

func New(fsys fs.FS) *Handler {
	return &Handler{fsys: fsys, next: http.FileServerFS(fsys), files: map[string]*file{}}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
	if name == "" {
		name = "index.html"
	}
	f := h.load(name)
	if f == nil {
		h.next.ServeHTTP(w, r)
		return
	}
	hd := w.Header()
	hd.Set("Cache-Control", "no-cache")
	hd.Set("Content-Type", f.contentType)
	body, etag := f.plain, f.etag
	if f.gz != nil {
		hd.Add("Vary", "Accept-Encoding")
		if acceptsGzip(r.Header.Get("Accept-Encoding")) {
			body, etag = f.gz, f.etagGz
			hd.Set("Content-Encoding", "gzip")
		}
	}
	hd.Set("ETag", etag)
	http.ServeContent(w, r, name, time.Time{}, bytes.NewReader(body))
}

func (h *Handler) load(name string) *file {
	h.mu.Lock()
	defer h.mu.Unlock()
	if f, ok := h.files[name]; ok {
		return f
	}
	data, err := fs.ReadFile(h.fsys, name)
	if err != nil {
		return nil
	}
	sum := sha256.Sum256(data)
	tag := hex.EncodeToString(sum[:8])
	ext := path.Ext(name)
	f := &file{plain: data, etag: `"` + tag + `"`, contentType: mime.TypeByExtension(ext)}
	if f.contentType == "" {
		f.contentType = http.DetectContentType(data)
	}
	if zipped[ext] {
		if gz := compress(data); len(gz) < len(data) {
			f.gz, f.etagGz = gz, `"`+tag+`-gz"`
		}
	}
	h.files[name] = f
	return f
}

func compress(data []byte) []byte {
	var buf bytes.Buffer
	zw, _ := gzip.NewWriterLevel(&buf, gzip.BestCompression)
	zw.Write(data)
	zw.Close()
	return buf.Bytes()
}

func acceptsGzip(header string) bool {
	for _, part := range strings.Split(header, ",") {
		coding, params, _ := strings.Cut(part, ";")
		if !strings.EqualFold(strings.TrimSpace(coding), "gzip") {
			continue
		}
		for _, p := range strings.Split(params, ";") {
			if k, v, _ := strings.Cut(strings.TrimSpace(p), "="); k == "q" {
				q, err := strconv.ParseFloat(v, 64)
				return err == nil && q > 0
			}
		}
		return true
	}
	return false
}
