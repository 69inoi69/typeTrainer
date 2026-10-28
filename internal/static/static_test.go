package static

import (
	"bytes"
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

var page = strings.Repeat("<p>typeTrainer</p>\n", 200)

func testFS() fstest.MapFS {
	return fstest.MapFS{
		"index.html":       {Data: []byte(page)},
		"app.js":           {Data: []byte(strings.Repeat("console.log(1);\n", 100))},
		"fonts/mono.woff2": {Data: bytes.Repeat([]byte{7, 1, 9}, 500)},
		"tiny.css":         {Data: []byte("a{}")},
	}
}

func get(h http.Handler, path string, header map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest("GET", path, nil)
	for k, v := range header {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestStatic_ETagAndNotModified(t *testing.T) {
	h := New(testFS())
	first := get(h, "/app.js", nil)
	etag := first.Header().Get("ETag")
	if first.Code != 200 || etag == "" {
		t.Fatalf("first: code %d, etag %q", first.Code, etag)
	}
	if cc := first.Header().Get("Cache-Control"); cc != "no-cache" {
		t.Errorf("Cache-Control %q, want no-cache (check the ETag every time)", cc)
	}
	again := get(h, "/app.js", map[string]string{"If-None-Match": etag})
	if again.Code != http.StatusNotModified || again.Body.Len() != 0 {
		t.Errorf("same ETag: code %d, %d bytes, want 304 and no body", again.Code, again.Body.Len())
	}
	if other := get(h, "/app.js", map[string]string{"If-None-Match": `"old"`}); other.Code != 200 {
		t.Errorf("other ETag: code %d, want 200", other.Code)
	}
}

func TestStatic_GzipForText(t *testing.T) {
	h := New(testFS())
	rec := get(h, "/", map[string]string{"Accept-Encoding": "br, gzip"})
	if rec.Header().Get("Content-Encoding") != "gzip" {
		t.Fatalf("index without gzip: %v", rec.Header())
	}
	if !strings.Contains(rec.Header().Get("Vary"), "Accept-Encoding") {
		t.Errorf("Vary %q, want Accept-Encoding", rec.Header().Get("Vary"))
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/html") {
		t.Errorf("Content-Type %q", ct)
	}
	zr, err := gzip.NewReader(rec.Body)
	if err != nil {
		t.Fatal(err)
	}
	got, _ := io.ReadAll(zr)
	if string(got) != page {
		t.Errorf("unzipped body differs from the file")
	}
	plain := get(h, "/", nil)
	if plain.Header().Get("Content-Encoding") != "" || plain.Body.String() != page {
		t.Errorf("without Accept-Encoding the file must go out as it is")
	}
	if plain.Header().Get("ETag") == rec.Header().Get("ETag") {
		t.Errorf("zipped and plain bodies share the ETag %s", plain.Header().Get("ETag"))
	}
}

func TestStatic_NoGzip(t *testing.T) {
	h := New(testFS())
	for _, tc := range []struct{ path, accept, why string }{
		{"/fonts/mono.woff2", "gzip", "a font is compressed already"},
		{"/tiny.css", "gzip", "zipping would make it bigger"},
		{"/app.js", "gzip;q=0", "the browser refuses gzip"},
		{"/app.js", "identity", "the browser does not ask for gzip"},
	} {
		rec := get(h, tc.path, map[string]string{"Accept-Encoding": tc.accept})
		if rec.Code != 200 || rec.Header().Get("Content-Encoding") != "" {
			t.Errorf("%s with %q: code %d, encoding %q; %s", tc.path, tc.accept, rec.Code, rec.Header().Get("Content-Encoding"), tc.why)
		}
	}
}

func TestStatic_MissingFile(t *testing.T) {
	h := New(testFS())
	if rec := get(h, "/nope.js", nil); rec.Code != http.StatusNotFound {
		t.Errorf("missing file: code %d, want 404", rec.Code)
	}
	if rec := get(h, "/../index.html", nil); rec.Code != 200 || rec.Body.String() != page {
		t.Errorf("a path with .. must stay inside the files: code %d", rec.Code)
	}
	for i := 0; i < 50; i++ {
		get(h, "/missing"+strings.Repeat("x", i), nil)
	}
	if len(h.files) > 4 {
		t.Errorf("missing paths are remembered: %d entries", len(h.files))
	}
}
