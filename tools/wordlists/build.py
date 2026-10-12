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
"""
import os
import sys

ALPHABET = {
    "en": "abcdefghijklmnopqrstuvwxyz",
    "pl": "aąbcćdeęfghijklłmnńoóprsśtuwyzźżqvx",
    "uk": "абвгґдеєжзиіїйклмнопрстуфхцчшщьюя",
    "ru": "абвгдежзийклмнопрстуфхцчшщъыьэюя",
}
ONE_LETTER = {"en": set("ai"), "pl": set("aiouwz"), "uk": set("явіузао"), "ru": set("явискуоа")}
VOWELS = set("aeiouyąęóаеєиіїоуюяыэ")
UK_KEEP = {"по"}  # short shared word that the Russian filter would drop
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
    path = os.path.join(HERE, f"block_{lang}.txt")
    return set(open(path, encoding="utf-8").read().split()) if os.path.exists(path) else set()


def build(src, out_root, n):
    freq = {lang: load(src, lang) for lang in ALPHABET}
    for lang, alphabet in ALPHABET.items():
        blocked, words = blocklist(lang), []
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
            if len(words) >= n:
                break
        os.makedirs(os.path.join(out_root, lang), exist_ok=True)
        with open(os.path.join(out_root, lang, "words.txt"), "w", encoding="utf-8") as f:
            f.write("\n".join(words) + "\n")
        print(lang, len(words), " ".join(words[:12]))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    root = os.path.join(HERE, "..", "..", "data", "langs")
    build(sys.argv[1], root, int(sys.argv[2]) if len(sys.argv) > 2 else 2000)
