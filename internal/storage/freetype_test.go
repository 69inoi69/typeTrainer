package storage

import "testing"

func TestFreetypeKey(t *testing.T) {
	for _, c := range []struct {
		n       int
		variant string
		key     string
	}{{1000, "", "1000"}, {200, VariantLong, "200-long"}, {0, VariantSentences, "sentences"}, {0, VariantCustom, "custom"}} {
		if got := FreetypeKey(c.n, c.variant); got != c.key {
			t.Errorf("FreetypeKey(%d, %q) = %q, want %q", c.n, c.variant, got, c.key)
		}
		if n, v, ok := ParseFreetypeKey(c.key); !ok || n != c.n || v != c.variant {
			t.Errorf("ParseFreetypeKey(%q) = %d, %q, %v", c.key, n, v, ok)
		}
	}
	for _, bad := range []string{"", "x", "0", "-5", "1000-", "1000-custom", "1000-sentences", "1000-punct", "long", "1000-long-long"} {
		if _, _, ok := ParseFreetypeKey(bad); ok {
			t.Errorf("ParseFreetypeKey(%q) accepted", bad)
		}
	}
}
