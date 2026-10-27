package auth

import (
	"strings"
	"testing"
)

const testIterations = 1000

var p = Params{NameMin: 3, NameMax: 20, PasswordMin: 8, PasswordMax: 128}

func TestPassword_RightAndWrong(t *testing.T) {
	h, err := HashPassword("correct horse", testIterations)
	if err != nil {
		t.Fatal(err)
	}
	if !CheckPassword("correct horse", h) {
		t.Fatal("the right password does not match")
	}
	if CheckPassword("correct horsE", h) || CheckPassword("", h) {
		t.Fatal("a wrong password matches")
	}
}

func TestPassword_SaltedAndHidden(t *testing.T) {
	a, _ := HashPassword("correct horse", testIterations)
	b, _ := HashPassword("correct horse", testIterations)
	if a == b {
		t.Fatal("two hashes of one password are equal: no salt?")
	}
	if strings.Contains(a, "correct") || !strings.HasPrefix(a, "pbkdf2-sha256$1000$") {
		t.Fatalf("unexpected format: %s", a)
	}
}

func TestPassword_MalformedNeverMatches(t *testing.T) {
	for _, s := range []string{"", "plain", "pbkdf2-sha256$x$00$00", "md5$1$00$00",
		"pbkdf2-sha256$0$00$00", "pbkdf2-sha256$10$zz$00", "pbkdf2-sha256$10$00$"} {
		if CheckPassword("anything", s) {
			t.Errorf("%q matched", s)
		}
	}
}

func TestToken_RandomAndHashed(t *testing.T) {
	t1, h1, err := NewToken()
	if err != nil {
		t.Fatal(err)
	}
	t2, _, _ := NewToken()
	if t1 == t2 || len(t1) < 40 {
		t.Fatalf("tokens not random enough: %q %q", t1, t2)
	}
	if h1 == t1 || h1 != HashToken(t1) {
		t.Fatal("the stored hash must be HashToken(token), never the token")
	}
}

func TestNames(t *testing.T) {
	if NormalizeName("  Sasha_88 ") != "sasha_88" {
		t.Fatal("NormalizeName")
	}
	for _, ok := range []string{"abc", "sasha_88", "a-b-c", "12345678901234567890"} {
		if !ValidName(ok, p) {
			t.Errorf("%q should be valid", ok)
		}
	}
	for _, bad := range []string{"", "ab", "123456789012345678901", "Sasha", "саша", "a b c", "a.b.c", "émile"} {
		if ValidName(bad, p) {
			t.Errorf("%q should be invalid", bad)
		}
	}
}

func TestPasswords(t *testing.T) {
	for _, ok := range []string{"12345678", "пароль12", strings.Repeat("x", 128)} {
		if !ValidPassword(ok, p) {
			t.Errorf("%q should be valid", ok)
		}
	}
	for _, bad := range []string{"", "1234567", strings.Repeat("x", 129), "abcdefg\xff"} {
		if ValidPassword(bad, p) {
			t.Errorf("%q should be invalid", bad)
		}
	}
}
