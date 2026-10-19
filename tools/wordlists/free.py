#!/usr/bin/env python3
"""Builds data/langs/<lang>/free.txt, the long word list of Freetype.

A one-off data tool like build.py (not part of the app). Learning and Climb
use words.txt (build.py, the 2000 most common words); Freetype lets the
typist choose how many of the most common words to draw from, up to
FREE_MAX, so it needs a much longer list.

Why a second filter: past the first few thousand words, the subtitle
counts of FrequencyWords are full of names (vera, nikki, schneider),
slang and fragments, too many to block by hand. A spelling dictionary
settles it: a word is kept only if the Hunspell dictionary of the
language accepts it in lower case. Names are written with a capital
there, so they drop out by themselves.

Sources:
  - word frequencies: https://github.com/hermitdave/FrequencyWords
    (content/2018, OpenSubtitles 2018), CC BY-SA 4.0
  - spelling: the Hunspell dictionary of the language (en: en_US from
    SCOWL, http://wordlist.aspell.net, as packaged in
    https://github.com/wooorm/dictionaries: dictionaries/en/index.dic and
    index.aff)
  - offensive words: the words the dictionary itself marks NOSUGGEST, plus
    https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words
    (the file "en"), CC BY 4.0

Usage (English; the other languages come back later and need their own
dictionaries):
    git clone --depth 1 https://github.com/hermitdave/FrequencyWords /tmp/fw
    python3 tools/wordlists/free.py /tmp/fw/content/2018 en index.dic index.aff bad_en.txt

Filtering, in this order, keeping the frequency order of the source:
  1-4, 7. the same as build.py: lower case, only the language's letters,
     real one-letter words, at least one vowel, not in block_<lang>.txt
  8. the word is a form the Hunspell dictionary accepts (a dictionary word
     with one of the endings or beginnings its affix rules allow)
  9. not marked offensive (NOSUGGEST in the dictionary, or in the list of
     bad words)
 10. keep the first FREE_MAX words
"""
# When to rerun: after a change to a rule here or in block_<lang>.txt. Do
# not edit free.txt by hand (AGENTS.md). The script prints the word count
# and samples at several ranks; check them, then run `go test ./...`.
import os
import re
import sys

from build import ALPHABET, ONE_LETTER, VOWELS, HERE, blocklist, load

FREE_MAX = 25000  # the largest Freetype list (config.go, FreetypeLists)


def affix_rules(path):
    """Flag -> (SFX or PFX, combines with the other kind, [(strip, add, condition)])."""
    rules, nosuggest = {}, None
    for line in open(path, encoding="utf-8"):
        p = line.split()
        if not p:
            continue
        if p[0] == "NOSUGGEST":
            nosuggest = p[1]
        if p[0] not in ("SFX", "PFX"):
            continue
        if len(p) == 4 and p[3].isdigit() and p[1] not in rules:  # the header of a rule group
            rules[p[1]] = (p[0], p[2] == "Y", [])
            continue
        kind, flag, strip, add = p[0], p[1], p[2], p[3].split("/")[0]
        cond = p[4] if len(p) > 4 else "."
        rx = re.compile("^" + cond if kind == "PFX" else cond + "$")
        rules[flag][2].append(("" if strip == "0" else strip, "" if add == "0" else add, rx))
    return rules, nosuggest


def forms(stem, flags, rules):
    """Every form of one dictionary entry: the stem, its suffixed forms, and
    the prefixed forms (of the suffixed ones too where both rules allow it)."""
    out, suffixed = {stem}, [stem]
    for f in flags:
        kind, cross, group = rules.get(f, ("", False, []))
        if kind != "SFX":
            continue
        for strip, add, rx in group:
            if rx.search(stem) and stem.endswith(strip):
                w = stem[: len(stem) - len(strip)] + add
                out.add(w)
                if cross:
                    suffixed.append(w)
    for f in flags:
        kind, cross, group = rules.get(f, ("", False, []))
        if kind != "PFX":
            continue
        for base in suffixed if cross else [stem]:
            for strip, add, rx in group:
                if rx.search(base) and base.startswith(strip):
                    out.add(add + base[len(strip):])
    return out


def dictionary(dic, aff):
    """(the accepted words, the words marked offensive), all forms."""
    rules, nosuggest = affix_rules(aff)
    ok, rude = set(), set()
    with open(dic, encoding="utf-8") as f:
        next(f)  # the first line is the number of entries
        for line in f:
            entry = line.split()[0] if line.split() else ""
            if not entry:
                continue
            stem, _, flags = entry.partition("/")
            (rude if nosuggest and nosuggest in flags else ok).update(forms(stem, flags, rules))
    return ok, rude


def build_free(src, lang, dic, aff, bad):
    ok, rude = dictionary(dic, aff)
    rude |= set(w.strip() for w in open(bad, encoding="utf-8") if w.strip())
    alphabet, blocked, words = ALPHABET[lang], blocklist(lang), []
    for w, _ in sorted(load(src, lang).items(), key=lambda x: -x[1]):
        if not all(ch in alphabet for ch in w):
            continue
        if len(w) == 1 and w not in ONE_LETTER[lang]:
            continue
        if len(w) > 1 and not any(ch in VOWELS for ch in w):
            continue
        if w in blocked or w not in ok or w in rude:
            continue
        words.append(w)
        if len(words) == FREE_MAX:
            break
    path = os.path.join(HERE, "..", "..", "data", "langs", lang, "free.txt")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(words) + "\n")
    print(lang, len(words))
    for rank in (0, 1000, 5000, 10000, len(words) - 10):
        print(f"  from {rank}:", " ".join(words[rank : rank + 10]))


if __name__ == "__main__":
    if len(sys.argv) != 6:
        sys.exit(__doc__)
    build_free(*sys.argv[1:])
