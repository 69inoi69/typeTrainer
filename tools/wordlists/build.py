#!/usr/bin/env python3
"""Builds data/langs/<lang>/words.txt."""
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
UK_KEEP = {"по"}
MIN_PER_LETTER = 10
NO_FILL = {"pl": set("qvx"), "uk": set("ґ")}
HERE = os.path.dirname(os.path.abspath(__file__))


def load(src, lang):
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
        words = with_rare_letters(words, n, set(alphabet) - NO_FILL.get(lang, set()))
        os.makedirs(os.path.join(out_root, lang), exist_ok=True)
        with open(os.path.join(out_root, lang, "words.txt"), "w", encoding="utf-8") as f:
            f.write("\n".join(words) + "\n")
        print(lang, len(words), " ".join(words[:12]))


def with_rare_letters(passed, n, alphabet):
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
