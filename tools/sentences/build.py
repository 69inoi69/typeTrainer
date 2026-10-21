#!/usr/bin/env python3
"""Builds data/langs/<lang>/sentences.txt, the real sentences of Freetype.

A one-off data tool like tools/wordlists (not part of the app). Freetype's
kind of text "sentences" (owner, 2026-10-21) gives real sentences, with
their capitals and punctuation, instead of marks sprinkled over random
words: punctuation is learned where it belongs.

Source: Tatoeba, https://tatoeba.org, the per-language export
  https://downloads.tatoeba.org/exports/per_language/<code>/<code>_sentences.tsv.bz2
(lines "id <tab> lang <tab> text"), CC BY 2.0 FR. The script downloads it
itself, or reads a copy given as the second argument.

Usage:
    python3 tools/sentences/build.py en [eng_sentences.tsv.bz2]

Filtering, in this order, keeping Tatoeba's order (by id, oldest first):
  1. curly quotes become ', and the text is trimmed
  2. only the language's letters (small and capital), spaces and the marks
     . , ? ! ; : ' - (config.go TextMarks: what the app accepts); a
     sentence with digits, quotes or anything else is dropped
  3. it starts with a capital and ends with . ? or !
  4. MIN_WORDS to MAX_WORDS words: a line or two of the text
  5. every word is common: it is in the language's free.txt (25 000 most
     common words; tools/wordlists/free.py), compared in lower case and
     without its marks, a hyphenated word part by part, and an English
     contraction ("don't", "Tom's") by the word before the apostrophe.
     This drops names (free.txt has none, they are capitalised in the
     dictionary), rare and misspelled words, and the offensive words
     free.py already left out
  6. each sentence once (case and marks kept), at most MAX_SENTENCES
"""
# When to rerun: after a change to a rule here, or to free.txt. Do not edit
# sentences.txt by hand (AGENTS.md). The script prints the count and a
# sample; check them, then run `go test ./...`.
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
MAX_SENTENCES = 12000  # plenty for no repeats in a session; keeps the file ~0.5 MB
# English contractions: the part after the apostrophe, and the words before
# "n't" that are not words on their own (can't, won't, shan't)
SUFFIXES = {"en": ("s", "t", "re", "ve", "ll", "d", "m")}
NT_STEMS = {"en": {"ca", "wo", "sha"}}


def alphabet(lang):
    import json
    for info in json.load(open(os.path.join(ROOT, "data", "languages.json"), encoding="utf-8")):
        if info["id"] == lang:
            return info["alphabet"]
    sys.exit(f"unknown language {lang}")


def common_word(word, lang, common):
    """Is the word (marks taken off, lower case) made of common words?"""
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
