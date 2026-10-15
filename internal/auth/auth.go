// Package auth is the small piece of security the accounts need: password
// hashing, random login tokens and the rules for names and passwords.
// Standard library only. It knows nothing about HTTP or storage: the api
// package puts tokens in cookies, the storage package keeps the hashes.
//
// The rule behind it: never keep a secret itself, only its hash. A
// password is hashed slowly (PBKDF2), because people pick guessable
// passwords; a login token is hashed fast (SHA-256), because it is already
// random. Limiter (limit.go) slows down guessing over the network.
package auth

import (
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"
	"unicode/utf8"
)

// Params are the tunable numbers (values and reasons in internal/config).
type Params struct {
	Iterations  int // PBKDF2 rounds for a new password hash
	LoginDays   int // how long a login cookie lasts
	NameMin     int // account name length, in characters
	NameMax     int
	PasswordMin int // password length, in characters
	PasswordMax int

	GuestDays     int // how long a guest's cookie (and so their progress) lasts
	Attempts      int // login/sign-up attempts allowed per IP address...
	AttemptWindow int // ...in this many minutes (see Limiter)
}

const (
	saltBytes  = 16 // 128 random bits per password: no two hashes alike
	keyBytes   = 32 // SHA-256 output size
	tokenBytes = 32 // 256 random bits per login token: impossible to guess
)

// HashPassword turns a password into a string that is safe to store:
//
//	pbkdf2-sha256$<iterations>$<salt, hex>$<key, hex>
//
// PBKDF2 runs SHA-256 `iterations` times, so checking one guess is slow on
// purpose. The random salt makes the same password hash differently for
// every user. The iterations are part of the string, so they can be raised
// later without breaking old hashes. PBKDF2 is described in RFC 8018.
func HashPassword(password string, iterations int) (string, error) {
	salt := make([]byte, saltBytes)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key, err := pbkdf2.Key(sha256.New, password, salt, iterations, keyBytes)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("pbkdf2-sha256$%d$%x$%x", iterations, salt, key), nil
}

// CheckPassword says whether the password matches a string from
// HashPassword. A malformed string never matches.
func CheckPassword(password, encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 4 || parts[0] != "pbkdf2-sha256" {
		return false
	}
	iterations, err := strconv.Atoi(parts[1])
	if err != nil || iterations < 1 {
		return false
	}
	salt, err1 := hex.DecodeString(parts[2])
	want, err2 := hex.DecodeString(parts[3])
	if err1 != nil || err2 != nil || len(want) == 0 {
		return false
	}
	got, err := pbkdf2.Key(sha256.New, password, salt, iterations, len(want))
	if err != nil {
		return false
	}
	// constant time: how long the comparison takes says nothing about how
	// many bytes matched
	return subtle.ConstantTimeCompare(got, want) == 1
}

// NewToken makes a random login token for the cookie, and the hash of it
// that the store keeps. The store never sees the token itself, so a stolen
// database cannot be used to log in.
func NewToken() (token, hash string, err error) {
	b := make([]byte, tokenBytes)
	if _, err := rand.Read(b); err != nil {
		return "", "", err
	}
	token = base64.RawURLEncoding.EncodeToString(b)
	return token, HashToken(token), nil
}

// HashToken is the store's key for a login token. A token already has 256
// random bits, so one fast SHA-256 is enough (no slow hashing needed).
func HashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// NormalizeName makes "  Sasha " and "sasha" the same account: trimmed and
// in lower case.
func NormalizeName(name string) string {
	return strings.ToLower(strings.TrimSpace(name))
}

// ValidName: NameMin..NameMax characters of a-z, 0-9, "_" and "-" (after
// NormalizeName). Latin only, so names that look alike in different
// alphabets ("a" and Cyrillic "а") cannot be two different accounts.
func ValidName(name string, p Params) bool {
	if len(name) < p.NameMin || len(name) > p.NameMax {
		return false
	}
	for _, c := range name {
		if !(c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '_' || c == '-') {
			return false
		}
	}
	return true
}

// ValidPassword: PasswordMin..PasswordMax characters, any characters.
func ValidPassword(password string, p Params) bool {
	n := utf8.RuneCountInString(password)
	return utf8.ValidString(password) && n >= p.PasswordMin && n <= p.PasswordMax
}
