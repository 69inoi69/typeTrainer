#!/usr/bin/env python3
"""Rebuilds the key sounds in web/sounds/ from public-domain recordings.

This is a one-off data tool, not part of the app (the app itself plays the
files, web/sound.js).

Source: the bundled packs of Clatterbox (https://github.com/zordhalo/clatterbox,
commit 1d7aacd67609871ad3c175d8725ef1c3bceacc72, src-tauri/resources/packs/),
which keeps byte-identical copies of the original recordings with a credit
for every file. All of them are CC0 1.0 (public domain):
  - tactile: real mechanical keystrokes by StavSounds (Freesound pack 42151),
    the long key by alpinemesh (Corsair K70 RGB), the backspace by yottasounds
  - classic: "Keyboard Soundpack 1" by unicaegames (OpenGameArt), a Cherry
    KC 1000 recorded with a Shure SM7B
Both lists below name the source file of every output file; CREDITS.md in
web/sounds/ is written from them.

Usage (needs ffmpeg on the PATH):
    git clone https://github.com/zordhalo/clatterbox /tmp/cb
    git -C /tmp/cb checkout 1d7aacd67609871ad3c175d8725ef1c3bceacc72
    python3 tools/sounds/build.py /tmp/cb/src-tauri/resources/packs

What it does to every recording, in this order:
  1. decode to mono, 44.1 kHz (ffmpeg)
  2. cut the silence before the hit: start ONSET_PAD_MS before the first
     sample louder than ONSET_LEVEL of the peak. Some recordings had 40 ms
     of silence first, which is heard as a late click.
  3. cut the tail: end TAIL_PAD_MS after the last sample louder than
     TAIL_LEVEL of the peak, at most MAX_MS long; fade the last FADE_MS out
     (a hard cut clicks)
  4. even out the loudness: the RMS of the first RMS_MS after the hit is set
     to TARGET_DB, but the peak never goes above PEAK_DB. The recordings came
     from different microphones and differed by up to 18 dB.
  5. save as 16-bit mono WAV. Not MP3: an MP3 encoder adds about 25 ms of
     silence at the start, which is the delay step 2 removes.
"""
# When to rerun: after a change to a list or a number below. Do not edit the
# WAV files by hand, so the thesis can describe exactly how they were made.
# To add a pack: a list like TACTILE below, an entry in PACKS, its place in
# web/sound.js (PACKS) and its name in web/i18n.js.

import os
import subprocess
import sys
import wave
from array import array

RATE = 44100
ONSET_LEVEL = 0.30   # of the peak: where the hit starts (lower caught the finger
                     # touching the key, 100 ms before the hit, in tactile down-02)
ONSET_PAD_MS = 1.5   # kept before the hit, so its very start is not cut
TAIL_LEVEL = 0.02    # of the peak: where the sound has died away
TAIL_PAD_MS = 20
MAX_MS = 220
FADE_MS = 30
RMS_MS = 50
TARGET_DB = -20.0
PEAK_DB = -1.0

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "web", "sounds")

# (output file, source file in the clatterbox pack, author, original page)
SP = "https://freesound.org/people/StavSounds/sounds/"
TACTILE = [
    ("key-01.wav", "tactile/down-01.mp3", "StavSounds", SP + "766628/"),
    ("key-02.wav", "tactile/down-02.mp3", "StavSounds", SP + "766629/"),
    ("key-03.wav", "tactile/down-03.mp3", "StavSounds", SP + "766630/"),
    # down-04 is left out: it clips (its peak is above full scale)
    ("key-04.wav", "tactile/down-05.mp3", "StavSounds", SP + "766632/"),
    ("key-05.wav", "tactile/down-06.mp3", "StavSounds", SP + "766633/"),
    ("key-06.wav", "tactile/down-07.mp3", "StavSounds", SP + "766634/"),
    ("key-07.wav", "tactile/down-08.mp3", "StavSounds", SP + "766635/"),
    ("key-08.wav", "tactile/down-09.mp3", "StavSounds", SP + "766637/"),
    ("key-09.wav", "tactile/down-10.mp3", "StavSounds", SP + "766638/"),
    ("key-10.wav", "tactile/down-11.mp3", "StavSounds", SP + "766639/"),
    # a long stabilised key (Enter) sounds like a space bar
    ("space.wav", "tactile/enter-down-01.mp3", "alpinemesh", "https://freesound.org/people/alpinemesh/sounds/627647/"),
    ("back.wav", "tactile/backspace-down-01.mp3", "yottasounds", "https://freesound.org/people/yottasounds/sounds/380141/"),
]
OGA = "https://opengameart.org/content/keyboard-soundpack-1-typing-and-single-keystrokes"
# clatterbox renamed keypress-NNN.wav to down-NN.wav (its CREDITS.md)
CLASSIC = [(f"key-{i:02d}.wav", f"classic/down-{i:02d}.wav", "unicaegames", OGA) for i in range(1, 11)]

PACKS = {"tactile": TACTILE, "classic": CLASSIC}


def decode(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(RATE), "-f", "s16le", "-"],
                         check=True, capture_output=True).stdout
    return [v / 32768 for v in array("h", raw)]


def ms(n):
    return int(RATE * n / 1000)


def process(x):
    peak = max(abs(v) for v in x)
    start = next(i for i, v in enumerate(x) if abs(v) > peak * ONSET_LEVEL)
    start = max(0, start - ms(ONSET_PAD_MS))
    last = max(i for i, v in enumerate(x) if abs(v) > peak * TAIL_LEVEL)
    end = min(len(x), last + ms(TAIL_PAD_MS), start + ms(MAX_MS))
    y = x[start:end]
    fade = min(ms(FADE_MS), len(y))
    for i in range(fade):
        y[len(y) - fade + i] *= 1 - (i + 1) / fade
    head = y[:ms(RMS_MS)]
    rms = (sum(v * v for v in head) / len(head)) ** 0.5
    gain = 10 ** (TARGET_DB / 20) / rms
    gain = min(gain, 10 ** (PEAK_DB / 20) / max(abs(v) for v in y))
    return [v * gain for v in y]


def save(path, y):
    data = array("h", (max(-32768, min(32767, round(v * 32767))) for v in y))
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(data.tobytes())


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    src = sys.argv[1]
    credits = ["# Key sounds: credits", "",
               "Every file here is public domain (CC0 1.0). Made by `tools/sounds/build.py`",
               "(trimmed, evened out, saved as WAV) from the copies kept by",
               "[Clatterbox](https://github.com/zordhalo/clatterbox) at commit",
               "`1d7aacd67609871ad3c175d8725ef1c3bceacc72`. CC0 does not ask for credit;",
               "it is given anyway, to keep the source of every file."]
    for pack, files in PACKS.items():
        os.makedirs(os.path.join(OUT, pack), exist_ok=True)
        credits += ["", f"## {pack}", "", "| File | Source file | Author | Original |", "|---|---|---|---|"]
        for out, inp, author, page in files:
            y = process(decode(os.path.join(src, inp)))
            save(os.path.join(OUT, pack, out), y)
            credits.append(f"| {out} | {inp} | {author} | {page} |")
            print(f"{pack}/{out}: {len(y) * 1000 // RATE} ms")
    with open(os.path.join(OUT, "CREDITS.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(credits) + "\n")


if __name__ == "__main__":
    main()
