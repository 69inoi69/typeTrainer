#!/usr/bin/env python3
"""Rebuilds data/langs/<lang>/words.txt from the FrequencyWords lists.

This is a one-off data tool, not part of the app (the app itself is Go only).

Source: https://github.com/hermitdave/FrequencyWords (content/2018), word
frequencies counted in OpenSubtitles 2018. Data license: CC BY-SA 4.0.

Usage:
    git clone --depth 1 https://github.com/hermitdave/FrequencyWords /tmp/fw
    python3 tools/wordlists/build.py /tmp/fw/content/2018

Filtering, in this order, keeping the frequency order of the source:
  1. lowercase; Russian ё -> е (common practice in typed Russian)
  2. keep only words made of the language's alphabet (no digits, no apostrophes)
  3. single-letter words only if they are real words in that language
  4. drop tokens without any vowel (encoding garbage like "фп")
  5. Ukrainian: drop words that are more than 1.6x more frequent in the Russian
     list (Ukrainian subtitles contain a lot of Russian text)
  6. Polish: drop words that are more frequent in the English list
     (mostly English names left untranslated)
  7. drop words from block_<lang>.txt (names, places, profanity, sound tags
     like "sighs", fragments like "don" from "don't"); built by hand
  8. keep the first N words (default 2000)
  9. every letter of the alphabet that is in fewer than MIN_PER_LETTER of
     those words gets its next most frequent words (that passed 1-7)
     appended at the end, until it has MIN_PER_LETTER. Otherwise a rare
     letter (Russian ъ: one word in the top 2000) would always be trained
     on the same word. The added words keep their frequency order and come
     after the N common ones, so the app treats them as the rarest.
     Not for the letters in NO_FILL: they only occur in loan words and
     names (Polish q v x, Ukrainian ґ), and filling them brings in names
     (vincent, quinn, ґрегорі) and garbage.
"""
# When to rerun: after a change to a block_<lang>.txt list or to a rule
# below. Do not edit words.txt by hand, so the thesis can describe exactly
# how the lists were made (AGENTS.md). An optional second argument changes
# N (the number of common words, default 2000). The script prints each
# language, its word count and its first words; check them, then run
# `go test ./...` (the lists are built into the program, setup.go go:embed,
# so restart `go run .` to use them).
import os
import sys

ALPHABET = {
    "en": "abcdefghijklmnopqrstuvwxyz",
    "pl": "aąbcćdeęfghijklłmnńoóprsśtuwyzźżqvx",
    "uk": "абвгґдеєжзиіїйклмнопрстуфхцчшщьюя",
    "ru": "абвгдежзийклмнопрстуфхцчшщъыьэюя",
}
# step 3: the one-letter words that are real words in each language
ONE_LETTER = {"en": set("ai"), "pl": set("aiouwz"), "uk": set("явіузао"), "ru": set("явискуоа")}
# step 4: a word with none of these is not a real word (all four languages)
VOWELS = set("aeiouyąęóаеєиіїоуюяыэ")
UK_KEEP = {"по"}  # short shared word that the Russian filter would drop
MIN_PER_LETTER = 10  # the same number as FloorWords in internal/config/config.go
NO_FILL = {"pl": set("qvx"), "uk": set("ґ")}
HERE = os.path.dirname(os.path.abspath(__file__))


def load(src, lang):
    """Word -> frequency per million words."""
    counts, total = {}, 0
    with open(os.path.join(src, lang, f"{lang}_50k.txt"), encoding="utf-8") as f:
        for line in f:
            parts = line.split()
            if len(parts) != 2:
                continue
            word, n = parts[0].lower(), int(parts[1])
            if lang == "ru":
                word = word.replace("ё", "е")
            counts[word] = counts.get(word, 0) + n
            total += n
    return {w: c / total * 1e6 for w, c in counts.items()}


def blocklist(lang):
    # step 7: block_<lang>.txt, one or more words per line; no file = no block list
    path = os.path.join(HERE, f"block_{lang}.txt")
    return set(open(path, encoding="utf-8").read().split()) if os.path.exists(path) else set()


def build(src, out_root, n):
    freq = {lang: load(src, lang) for lang in ALPHABET}
    for lang, alphabet in ALPHABET.items():
        blocked, words = blocklist(lang), []
        # most frequent first; each check below is one numbered step of the docstring
        for w, p in sorted(freq[lang].items(), key=lambda x: -x[1]):
            if not all(ch in alphabet for ch in w):
                continue
            if len(w) == 1 and w not in ONE_LETTER[lang]:
                continue
            if len(w) > 1 and not any(ch in VOWELS for ch in w):
                continue
            if lang == "uk" and len(w) > 1 and w not in UK_KEEP and freq["ru"].get(w, 0) > 1.6 * p:
                continue
            if lang == "pl" and freq["en"].get(w, 0) > p:
                continue
            if w in blocked:
                continue
            words.append(w)
        words = with_rare_letters(words, n, set(alphabet) - NO_FILL.get(lang, set()))
        os.makedirs(os.path.join(out_root, lang), exist_ok=True)
        with open(os.path.join(out_root, lang, "words.txt"), "w", encoding="utf-8") as f:
            f.write("\n".join(words) + "\n")
        print(lang, len(words), " ".join(words[:12]))


def with_rare_letters(passed, n, alphabet):
    """The first n words, plus words for letters that are in too few of them (step 9)."""
    words = passed[:n]
    count = {ch: sum(ch in w for w in words) for ch in alphabet}
    for w in passed[n:]:
        if any(count.get(ch, MIN_PER_LETTER) < MIN_PER_LETTER for ch in set(w)):
            words.append(w)
            for ch in set(w) & alphabet:
                count[ch] += 1
    return words


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    root = os.path.join(HERE, "..", "..", "data", "langs")
    build(sys.argv[1], root, int(sys.argv[2]) if len(sys.argv) > 2 else 2000)
