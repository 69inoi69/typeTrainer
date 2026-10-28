// Account routes: sign up, log in, log out, who am I.

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

const (
	loginCookie = "tt_login"
	guestCookie = "tt_guest"
)

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
		return storage.GuestPrefix + auth.HashToken(c.Value), nil
	}
	return storage.LocalUser, nil
}

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
			r.AddCookie(&http.Cookie{Name: guestCookie, Value: token})
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) isHTTPS(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	return s.cfg.BehindProxy && r.Header.Get("X-Forwarded-Proto") == "https"
}

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

func (s *Server) tooManyAttempts(w http.ResponseWriter, ip string) bool {
	wait := s.attempts.Wait(ip, time.Now())
	if wait == 0 {
		return false
	}
	w.Header().Set("Retry-After", strconv.Itoa(int(math.Ceil(wait.Seconds()))))
	writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "too many attempts, try again later"})
	return true
}

type credentials struct {
	Name     string `json:"name"`
	Password string `json:"password"`
}

func (s *Server) readCredentials(w http.ResponseWriter, r *http.Request) (credentials, bool) {
	var c credentials
	if !s.cfg.Accounts {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "accounts are off in this version"})
		return c, false
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, int64(s.cfg.MaxAuthBodyBytes))).Decode(&c); err != nil {
		badRequest(w, "invalid JSON")
		return c, false
	}
	c.Name = auth.NormalizeName(c.Name)
	return c, true
}

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
	from, err := s.userOf(r)
	if err != nil {
		serverError(w, err)
		return
	}
	if from == storage.LocalUser || !storage.IsGuest(from) {
		from = ""
	}
	u, err := s.store.CreateUser(c.Name, hash, time.Now(), from)
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

var (
	dummyOnce sync.Once
	dummy     string
)

func (s *Server) dummyHash() string {
	dummyOnce.Do(func() {
		dummy, _ = auth.HashPassword("no account has this password", s.cfg.Auth.Iterations)
	})
	return dummy
}
