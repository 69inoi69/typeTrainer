#!/usr/bin/env python3
"""Builds data/langs/<lang>/free.txt."""
import os
import re
import sys

from build import ALPHABET, ONE_LETTER, VOWELS, HERE, blocklist, load

FREE_MAX = 25000


def affix_rules(path):
    rules, nosuggest = {}, None
    for line in open(path, encoding="utf-8"):
        p = line.split()
        if not p:
            continue
        if p[0] == "NOSUGGEST":
            nosuggest = p[1]
        if p[0] not in ("SFX", "PFX"):
            continue
        if len(p) == 4 and p[3].isdigit() and p[1] not in rules:
            rules[p[1]] = (p[0], p[2] == "Y", [])
            continue
        kind, flag, strip, add = p[0], p[1], p[2], p[3].split("/")[0]
        cond = p[4] if len(p) > 4 else "."
        rx = re.compile("^" + cond if kind == "PFX" else cond + "$")
        rules[flag][2].append(("" if strip == "0" else strip, "" if add == "0" else add, rx))
    return rules, nosuggest


def forms(stem, flags, rules):
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
    rules, nosuggest = affix_rules(aff)
    ok, rude = set(), set()
    with open(dic, encoding="utf-8") as f:
        next(f)
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
