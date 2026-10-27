#!/usr/bin/env python3
"""Builds data/langs/<lang>/sentences.txt."""
import bz2
import io
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
TATOEBA = {"en": "eng", "pl": "pol", "uk": "ukr", "ru": "rus"}
URL = "https://downloads.tatoeba.org/exports/per_language/{0}/{0}_sentences.tsv.bz2"
MARKS = ".,?!;:'-"
MIN_WORDS, MAX_WORDS = 4, 18
MAX_SENTENCES = 12000
SUFFIXES = {"en": ("s", "t", "re", "ve", "ll", "d", "m")}
NT_STEMS = {"en": {"ca", "wo", "sha"}}


def alphabet(lang):
    import json
    for info in json.load(open(os.path.join(ROOT, "data", "languages.json"), encoding="utf-8")):
        if info["id"] == lang:
            return info["alphabet"]
    sys.exit(f"unknown language {lang}")


def common_word(word, lang, common):
    word = word.strip(MARKS).lower()
    if not word:
        return False
    if "-" in word:
        return all(common_word(part, lang, common) for part in word.split("-"))
    if "'" in word:
        stem, _, end = word.partition("'")
        if end not in SUFFIXES.get(lang, ()):
            return False
        if end == "t" and stem.endswith("n"):
            stem = stem[:-1]
            return stem in common or stem in NT_STEMS.get(lang, set())
        return stem in common
    return word in common


def keep(text, lang, letters, common):
    text = text.replace("’", "'").replace("‘", "'").strip()
    allowed = set(letters) | set(letters.upper()) | set(MARKS) | {" "}
    if not text or any(c not in allowed for c in text):
        return None
    if not text[0].isupper() or text[-1] not in ".?!":
        return None
    words = text.split()
    if not MIN_WORDS <= len(words) <= MAX_WORDS:
        return None
    if not all(common_word(w, lang, common) for w in words):
        return None
    return " ".join(words)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    lang = sys.argv[1]
    letters = alphabet(lang)
    common = set(open(os.path.join(ROOT, "data", "langs", lang, "free.txt"), encoding="utf-8").read().split())
    if len(sys.argv) > 2:
        raw = open(sys.argv[2], "rb").read()
    else:
        raw = urllib.request.urlopen(URL.format(TATOEBA[lang])).read()
    if raw[:3] == b"BZh":
        raw = bz2.decompress(raw)
    out, seen = [], set()
    for line in io.StringIO(raw.decode("utf-8")):
        parts = line.rstrip("\n").split("\t")
        if len(parts) < 3:
            continue
        text = keep(parts[2], lang, letters, common)
        if text and text not in seen:
            seen.add(text)
            out.append(text)
            if len(out) >= MAX_SENTENCES:
                break
    path = os.path.join(ROOT, "data", "langs", lang, "sentences.txt")
    with open(path, "w", encoding="utf-8") as f:
        f.write("# Sentences from Tatoeba (https://tatoeba.org), CC BY 2.0 FR.\n")
        f.write("# Built by tools/sentences/build.py; do not edit by hand.\n")
        f.write("\n".join(out) + "\n")
    print(f"{lang}: {len(out)} sentences -> {path}")
    for s in out[:: max(1, len(out) // 12)]:
        print("  ", s)


if __name__ == "__main__":
    main()
