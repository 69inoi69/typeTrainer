package main

// Accounts and guests through the whole app.

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func callAs(t *testing.T, h http.Handler, cookie, method, path, body string) (int, map[string]any, string) {
	t.Helper()
	req := guestRequest(method, path, body)
	if cookie != "" {
		req.AddCookie(&http.Cookie{Name: "tt_login", Value: cookie})
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var out map[string]any
	json.Unmarshal(rec.Body.Bytes(), &out)
	set := ""
	for _, c := range rec.Result().Cookies() {
		if c.Name == "tt_login" {
			set = c.Value
			if !c.HttpOnly || c.SameSite != http.SameSiteLaxMode {
				t.Fatalf("login cookie must be HttpOnly and SameSite=Lax: %+v", c)
			}
		}
	}
	return rec.Code, out, set
}

func TestApp_Accounts(t *testing.T) {
	h, _, _ := newApp()
	_, me, _ := callAs(t, h, "", "GET", "/api/v1/auth/me", "")
	if me["accounts"] != true || me["name"] != nil {
		t.Fatalf("guest /me: %v", me)
	}

	code, out, ann := callAs(t, h, "", "POST", "/api/v1/auth/register", `{"name":" Ann ","password":"secret-ann"}`)
	if code != 200 || out["name"] != "ann" || ann == "" {
		t.Fatalf("register: %d %v cookie=%q", code, out, ann)
	}
	if _, me, _ := callAs(t, h, ann, "GET", "/api/v1/auth/me", ""); me["name"] != "ann" {
		t.Fatalf("ann /me: %v", me)
	}

	for body, want := range map[string]int{
		`{"name":"ANN","password":"another-pw"}`:  409,
		`{"name":"a","password":"secret-ann"}`:    400,
		`{"name":"анна","password":"secret-ann"}`: 400,
		`{"name":"bob","password":"short"}`:       400,
		`not json`:                                400,
	} {
		if code, _, _ := callAs(t, h, "", "POST", "/api/v1/auth/register", body); code != want {
			t.Errorf("register %s: %d, want %d", body, code, want)
		}
	}

	round := `{"samples":[{"char":"ж","errors":0,"ms":300}],"wpm":30,"accuracy":100}`
	if code, _, _ := callAs(t, h, ann, "POST", "/api/v1/results?lang=ru", round); code != 200 {
		t.Fatalf("ann's round: %d", code)
	}
	_, guest, _ := callAs(t, h, "", "GET", "/api/v1/stats?lang=ru", "")
	_, mine, _ := callAs(t, h, ann, "GET", "/api/v1/stats?lang=ru", "")
	if guest["sessionCount"].(float64) != 0 || mine["sessionCount"].(float64) != 1 {
		t.Fatalf("guest=%v ann=%v", guest["sessionCount"], mine["sessionCount"])
	}

	for _, body := range []string{`{"name":"ann","password":"wrong-pass"}`, `{"name":"nobody","password":"secret-ann"}`} {
		if code, out, c := callAs(t, h, "", "POST", "/api/v1/auth/login", body); code != 401 || c != "" || out["error"] != "wrong name or password" {
			t.Errorf("login %s: %d %v", body, code, out)
		}
	}
	code, _, ann2 := callAs(t, h, "", "POST", "/api/v1/auth/login", `{"name":"Ann","password":"secret-ann"}`)
	if code != 200 || ann2 == "" || ann2 == ann {
		t.Fatalf("login: %d, a new cookie expected", code)
	}
	if _, again, _ := callAs(t, h, ann2, "GET", "/api/v1/stats?lang=ru", ""); again["sessionCount"].(float64) != 1 {
		t.Fatal("after logging in again ann's data is gone")
	}

	callAs(t, h, ann, "POST", "/api/v1/auth/logout", "")
	if _, me, _ := callAs(t, h, ann, "GET", "/api/v1/auth/me", ""); me["name"] != nil {
		t.Fatalf("after logout: %v", me)
	}
	if _, me, _ := callAs(t, h, ann2, "GET", "/api/v1/auth/me", ""); me["name"] != "ann" {
		t.Fatal("logout ended the other login too")
	}
	if code, me, _ := callAs(t, h, "made-up", "GET", "/api/v1/auth/me", ""); code != 200 || me["name"] != nil {
		t.Fatalf("unknown cookie: %d %v", code, me)
	}
}

func TestApp_SignUpKeepsGuestProgress(t *testing.T) {
	h, _, _ := newApp()
	round := `{"samples":[{"char":"ж","errors":0,"ms":300}],"wpm":30,"accuracy":100}`
	if code, _, _ := callAs(t, h, "", "POST", "/api/v1/results?lang=ru", round); code != 200 {
		t.Fatalf("guest's round: %d", code)
	}
	_, _, ann := callAs(t, h, "", "POST", "/api/v1/auth/register", `{"name":"ann","password":"secret-ann"}`)
	_, mine, _ := callAs(t, h, ann, "GET", "/api/v1/stats?lang=ru", "")
	_, guest, _ := callAs(t, h, "", "GET", "/api/v1/stats?lang=ru", "")
	if mine["sessionCount"].(float64) != 1 || guest["sessionCount"].(float64) != 0 {
		t.Fatalf("after sign up: ann=%v guest=%v", mine["sessionCount"], guest["sessionCount"])
	}

	callAs(t, h, "", "POST", "/api/v1/results?lang=ru", round)
	callAs(t, h, "", "POST", "/api/v1/results?lang=ru", round)
	_, _, again := callAs(t, h, "", "POST", "/api/v1/auth/login", `{"name":"ann","password":"secret-ann"}`)
	_, mine, _ = callAs(t, h, again, "GET", "/api/v1/stats?lang=ru", "")
	_, guest, _ = callAs(t, h, "", "GET", "/api/v1/stats?lang=ru", "")
	if mine["sessionCount"].(float64) != 1 || guest["sessionCount"].(float64) != 2 {
		t.Fatalf("log in must not mix the two: ann=%v guest=%v", mine["sessionCount"], guest["sessionCount"])
	}
}

func cookieOf(rec *httptest.ResponseRecorder, name string) *http.Cookie {
	for _, c := range rec.Result().Cookies() {
		if c.Name == name {
			return c
		}
	}
	return nil
}

func TestApp_GuestPerBrowser(t *testing.T) {
	h, _, _ := newApp()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/", nil))
	c := cookieOf(rec, "tt_guest")
	if c == nil || c.Value == "" || !c.HttpOnly || c.SameSite != http.SameSiteLaxMode || c.MaxAge <= 0 {
		t.Fatalf("the page must set a guest cookie: %+v", c)
	}
	if c.Secure {
		t.Fatal("plain HTTP without a proxy: the cookie cannot be Secure")
	}
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, guestRequest("GET", "/", ""))
	if cookieOf(rec, "tt_guest") != nil {
		t.Fatal("an existing guest cookie must not be replaced")
	}

	round := `{"samples":[{"char":"ж","errors":0,"ms":300}],"wpm":30,"accuracy":100}`
	call(t, h, "POST", "/api/v1/results?lang=ru", round)
	other := httptest.NewRequest("GET", "/api/v1/stats?lang=ru", nil)
	other.AddCookie(c)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, other)
	var theirs map[string]any
	json.Unmarshal(rec.Body.Bytes(), &theirs)
	_, mine := call(t, h, "GET", "/api/v1/stats?lang=ru", "")
	if theirs["sessionCount"].(float64) != 0 || mine["sessionCount"].(float64) != 1 {
		t.Fatalf("new guest=%v test browser=%v", theirs["sessionCount"], mine["sessionCount"])
	}
}

func fromIP(t *testing.T, h http.Handler, ip, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := guestRequest("POST", path, body)
	req.RemoteAddr = ip + ":5000"
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestApp_LoginAttemptLimit(t *testing.T) {
	h, cfg, _ := newApp()
	if rec := fromIP(t, h, "10.0.0.1", "/api/v1/auth/register", `{"name":"ann","password":"secret-ann"}`); rec.Code != 200 {
		t.Fatalf("register: %d", rec.Code)
	}
	right := `{"name":"ann","password":"secret-ann"}`
	for i := 0; i < cfg.Auth.Attempts; i++ {
		path, body := "/api/v1/auth/register", `{"name":"x","password":"short"}`
		if i < 2 {
			path, body = "/api/v1/auth/login", `{"name":"ann","password":"wrong-pass"}`
		}
		if rec := fromIP(t, h, "10.0.0.2", path, body); rec.Code == 429 {
			t.Fatalf("attempt %d refused too early", i+1)
		}
	}
	rec := fromIP(t, h, "10.0.0.2", "/api/v1/auth/login", right)
	if rec.Code != 429 || rec.Header().Get("Retry-After") == "" {
		t.Fatalf("over the limit: %d, Retry-After=%q", rec.Code, rec.Header().Get("Retry-After"))
	}
	if rec := fromIP(t, h, "10.0.0.3", "/api/v1/auth/login", right); rec.Code != 200 {
		t.Fatalf("another address must not be limited: %d", rec.Code)
	}
}

func TestApp_BehindProxy(t *testing.T) {
	viaProxy := func(h http.Handler, forwardedFor string) *httptest.ResponseRecorder {
		req := httptest.NewRequest("POST", "/api/v1/auth/register", strings.NewReader(`{"name":"x","password":"short"}`))
		req.Header.Set("X-Forwarded-Proto", "https")
		req.Header.Set("X-Forwarded-For", forwardedFor)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}

	h, _, _ := newApp()
	if c := cookieOf(viaProxy(h, "1.1.1.1"), "tt_guest"); c == nil || c.Secure {
		t.Fatalf("no BEHIND_PROXY: the header must be ignored: %+v", c)
	}

	t.Setenv("BEHIND_PROXY", "1")
	h, cfg, _ := newApp()
	if c := cookieOf(viaProxy(h, "1.1.1.1"), "tt_guest"); c == nil || !c.Secure {
		t.Fatalf("HTTPS through the proxy: the cookie must be Secure: %+v", c)
	}
	for i := 0; i < cfg.Auth.Attempts; i++ {
		viaProxy(h, "fake-"+strings.Repeat("x", i)+", 9.9.9.9")
	}
	if rec := viaProxy(h, "fake-new, 9.9.9.9"); rec.Code != 429 {
		t.Fatalf("faking X-Forwarded-For got around the limit: %d", rec.Code)
	}
	if rec := viaProxy(h, "8.8.8.8"); rec.Code == 429 {
		t.Fatal("another client must not be limited")
	}
}
