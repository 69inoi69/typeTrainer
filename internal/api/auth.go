// Account routes: sign up, log in, log out, "who am I". Passwords and
// tokens are handled by internal/auth; the store keeps users and logins.
// A logged-in browser carries a cookie with a random token; userOf turns it
// into the user id that every other route works with.

package api

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"sync"
	"time"

	"typingtrainer/internal/auth"
	"typingtrainer/internal/storage"
)

const loginCookie = "tt_login"

// userOf says whose data a request works with: the user of a valid login
// cookie, or storage.LocalUser (a guest) without one. An expired or unknown
// cookie also means a guest. Only a failing store is an error: then the
// request must stop, so a logged-in user's data never lands with the guest.
func (s *Server) userOf(r *http.Request) (string, error) {
	if !s.cfg.Accounts {
		return storage.LocalUser, nil
	}
	c, err := r.Cookie(loginCookie)
	if err != nil || c.Value == "" {
		return storage.LocalUser, nil
	}
	id, err := s.store.LoginUser(auth.HashToken(c.Value), time.Now())
	if errors.Is(err, storage.ErrNotFound) {
		return storage.LocalUser, nil
	}
	return id, err
}

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
// auth.ValidPassword), 409 if the name is taken. A new account starts empty:
// the guest's progress stays with the guest.
func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	c, ok := s.readCredentials(w, r)
	if !ok {
		return
	}
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
// which, so it cannot be used to find out which names exist).
func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	c, ok := s.readCredentials(w, r)
	if !ok {
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
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "wrong name or password"})
		return
	}
	s.logIn(w, r, u)
}

// logIn makes a new login for the user and sets its cookie: HttpOnly (page
// scripts cannot read it), SameSite=Lax (other sites cannot send requests
// with it), Secure when the connection is HTTPS.
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
		HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: r.TLS != nil,
	})
	writeJSON(w, http.StatusOK, map[string]string{"name": u.Name})
}

// POST /api/v1/auth/logout -> {"ok": true}: forgets the login on the server
// and deletes the cookie. Fine to call when not logged in.
func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(loginCookie); err == nil && c.Value != "" {
		if err := s.store.DeleteLogin(auth.HashToken(c.Value)); err != nil {
			log.Println("logout:", err)
		}
	}
	http.SetCookie(w, &http.Cookie{
		Name: loginCookie, Value: "", Path: "/", MaxAge: -1,
		HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: r.TLS != nil,
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
	if user != storage.LocalUser {
		u, err := s.store.UserByID(user)
		if err != nil {
			serverError(w, err)
			return
		}
		out["name"] = u.Name
	}
	writeJSON(w, http.StatusOK, out)
}

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
