// Account routes: sign up, log in, log out, "who am I". Passwords and
// tokens are handled by internal/auth; the store keeps users and logins.
// A logged-in browser carries a cookie with a random token; every other
// browser carries a guest cookie (WithGuest). userOf turns them into the
// user id that every other route works with.

package api

import (
	"encoding/json"
	"errors"
	"log"
	"math"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"typingtrainer/internal/auth"
	"typingtrainer/internal/storage"
)

// The two cookies. Both hold only a random token, never a user id, so
// a browser cannot claim to be someone else by editing its cookie.
const (
	loginCookie = "tt_login"
	guestCookie = "tt_guest"
)

// userOf says whose data a request works with: the user of a valid login
// cookie; without one, the guest of the guest cookie (WithGuest); without
// that either, storage.LocalUser. An expired or unknown login cookie also
// means the guest. Only a failing store is an error: then the request must
// stop, so a logged-in user's data never lands with the guest.
func (s *Server) userOf(r *http.Request) (string, error) {
	if !s.cfg.Accounts {
		return storage.LocalUser, nil
	}
	if c, err := r.Cookie(loginCookie); err == nil && c.Value != "" {
		id, err := s.store.LoginUser(auth.HashToken(c.Value), time.Now())
		if !errors.Is(err, storage.ErrNotFound) {
			return id, err
		}
	}
	if c, err := r.Cookie(guestCookie); err == nil && c.Value != "" {
		// the id is a hash of the cookie, so reading the database (or an
		// export) never gives away the cookie that opens a guest's data
		return storage.GuestPrefix + auth.HashToken(c.Value), nil
	}
	return storage.LocalUser, nil
}

// WithGuest gives every browser its own guest: a request without a guest
// cookie gets a new random one, so two visitors without accounts never see
// each other's progress. It wraps the whole site, so the cookie is already
// set by the page itself (index.html), before the scripts' first API calls.
// Off where accounts are off (GitHub Pages: there is only one person, the
// one in the tab).
func (s *Server) WithGuest(next http.Handler) http.Handler {
	if !s.cfg.Accounts {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if c, err := r.Cookie(guestCookie); err != nil || c.Value == "" {
			token, _, err := auth.NewToken()
			if err != nil {
				serverError(w, err)
				return
			}
			age := time.Duration(s.cfg.Auth.GuestDays) * 24 * time.Hour
			http.SetCookie(w, &http.Cookie{
				Name: guestCookie, Value: token, Path: "/", MaxAge: int(age.Seconds()),
				HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: s.isHTTPS(r),
			})
			r.AddCookie(&http.Cookie{Name: guestCookie, Value: token}) // this request is that guest too
		}
		next.ServeHTTP(w, r)
	})
}

// isHTTPS says whether the browser reached us over HTTPS: directly, or
// through a proxy that ended HTTPS and says so (cfg.BehindProxy).
// Cookies get Secure then: the browser never sends them over plain HTTP.
func (s *Server) isHTTPS(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	return s.cfg.BehindProxy && r.Header.Get("X-Forwarded-Proto") == "https"
}

// clientIP is the address the limit on login attempts counts by. Behind a
// proxy every request comes from the proxy, so the real address is the last
// one in X-Forwarded-For: the one the proxy itself added (earlier ones are
// written by the client and could be anything).
func (s *Server) clientIP(r *http.Request) string {
	if s.cfg.BehindProxy {
		if f := r.Header.Get("X-Forwarded-For"); f != "" {
			parts := strings.Split(f, ",")
			return strings.TrimSpace(parts[len(parts)-1])
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// tooManyAttempts answers 429 with Retry-After (in seconds) and returns
// true if this IP address used up its login/sign-up attempts.
func (s *Server) tooManyAttempts(w http.ResponseWriter, ip string) bool {
	wait := s.attempts.Wait(ip, time.Now())
	if wait == 0 {
		return false
	}
	w.Header().Set("Retry-After", strconv.Itoa(int(math.Ceil(wait.Seconds()))))
	writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "too many attempts, try again later"})
	return true
}

// credentials is the body of a sign-up or login request.
type credentials struct {
	Name     string `json:"name"`
	Password string `json:"password"`
}

// readCredentials reads {name, password} (at most 4 KB) and normalizes the
// name. It answers the request itself and returns false if accounts are
// off or the body is broken.
func (s *Server) readCredentials(w http.ResponseWriter, r *http.Request) (credentials, bool) {
	var c credentials
	if !s.cfg.Accounts {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "accounts are off in this version"})
		return c, false
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&c); err != nil {
		badRequest(w, "invalid JSON")
		return c, false
	}
	c.Name = auth.NormalizeName(c.Name)
	return c, true
}

// POST /api/v1/auth/register {name, password} -> {"name": "sasha"} and a
// login cookie. 400 if the name or password breaks the rules (auth.ValidName,
// auth.ValidPassword), 409 if the name is taken, 429 after too many attempts
// from one IP address (every sign-up counts: each one costs a slow password
// hash, and nobody needs ten accounts in 15 minutes). A new account starts
// empty: the guest's progress stays with the guest.
func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	c, ok := s.readCredentials(w, r)
	if !ok {
		return
	}
	ip := s.clientIP(r)
	if s.tooManyAttempts(w, ip) {
		return
	}
	s.attempts.Count(ip, time.Now())
	p := s.cfg.Auth
	if !auth.ValidName(c.Name, p) || !auth.ValidPassword(c.Password, p) {
		badRequest(w, "name or password does not follow the rules")
		return
	}
	hash, err := auth.HashPassword(c.Password, p.Iterations)
	if err != nil {
		serverError(w, err)
		return
	}
	u, err := s.store.CreateUser(c.Name, hash, time.Now())
	if errors.Is(err, storage.ErrNameTaken) {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "name taken"})
		return
	}
	if err != nil {
		serverError(w, err)
		return
	}
	s.logIn(w, r, u)
}

// POST /api/v1/auth/login {name, password} -> {"name": "sasha"} and a login
// cookie, or 401 for a wrong name OR password (the answer does not say
// which, so it cannot be used to find out which names exist). Failed logins
// count per IP address; after too many the answer is 429 until the window
// ends, even for the right password. A successful login clears the count.
func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	c, ok := s.readCredentials(w, r)
	if !ok {
		return
	}
	ip := s.clientIP(r)
	if s.tooManyAttempts(w, ip) {
		return
	}
	u, err := s.store.UserByName(c.Name)
	if err != nil && !errors.Is(err, storage.ErrNotFound) {
		serverError(w, err)
		return
	}
	hash := u.PasswordHash
	if err != nil {
		// unknown name: still check the password against a dummy hash, so
		// the answer takes as long as for a real name
		hash = s.dummyHash()
	}
	if !auth.CheckPassword(c.Password, hash) || err != nil {
		s.attempts.Count(ip, time.Now())
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "wrong name or password"})
		return
	}
	s.attempts.Forget(ip)
	s.logIn(w, r, u)
}

// logIn makes a new login for the user and sets its cookie: HttpOnly (page
// scripts cannot read it), SameSite=Lax (other sites cannot send requests
// with it), Secure when the connection is HTTPS (isHTTPS).
func (s *Server) logIn(w http.ResponseWriter, r *http.Request, u storage.User) {
	token, hash, err := auth.NewToken()
	if err != nil {
		serverError(w, err)
		return
	}
	age := time.Duration(s.cfg.Auth.LoginDays) * 24 * time.Hour
	if err := s.store.AddLogin(hash, u.ID, time.Now().Add(age)); err != nil {
		serverError(w, err)
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name: loginCookie, Value: token, Path: "/", MaxAge: int(age.Seconds()),
		HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: s.isHTTPS(r),
	})
	writeJSON(w, http.StatusOK, map[string]string{"name": u.Name})
}

// POST /api/v1/auth/logout -> {"ok": true}: forgets the login on the server
// and deletes the cookie. Fine to call when not logged in. The browser goes
// back to its guest (the guest cookie stays).
func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(loginCookie); err == nil && c.Value != "" {
		if err := s.store.DeleteLogin(auth.HashToken(c.Value)); err != nil {
			log.Println("logout:", err)
		}
	}
	http.SetCookie(w, &http.Cookie{
		Name: loginCookie, Value: "", Path: "/", MaxAge: -1,
		HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: s.isHTTPS(r),
	})
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// GET /api/v1/auth/me -> {"accounts": true, "name": "sasha"}; name is null
// for a guest; accounts is false where they cannot work (GitHub Pages).
func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	out := map[string]any{"accounts": s.cfg.Accounts, "name": nil}
	user, err := s.userOf(r)
	if err != nil {
		serverError(w, err)
		return
	}
	if !storage.IsGuest(user) {
		u, err := s.store.UserByID(user)
		if err != nil {
			serverError(w, err)
			return
		}
		out["name"] = u.Name
	}
	writeJSON(w, http.StatusOK, out)
}

// dummy is the hash made by dummyHash; sync.Once makes sure it is made
// only once, even when two logins arrive at the same moment.
var (
	dummyOnce sync.Once
	dummy     string
)

// dummyHash is a password hash nobody's password matches, with the same
// cost as a real one. Made once, on the first login with an unknown name.
func (s *Server) dummyHash() string {
	dummyOnce.Do(func() {
		dummy, _ = auth.HashPassword("no account has this password", s.cfg.Auth.Iterations)
	})
	return dummy
}
