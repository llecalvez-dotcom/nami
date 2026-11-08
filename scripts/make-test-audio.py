#!/usr/bin/env python3
"""Ticket 0: makes the two short audio files of fixtures/audio used by the bench's voice check (/api/voice/transcribe).

Synthetic voices (gTTS, Google's text to speech, network needed once), 16 kHz mono WAV through ffmpeg:
  fixtures/audio/fr-bali-mariage.wav  "Je pars à Bali lundi pour le mariage d'un ami"
  fixtures/audio/en-yes.wav           "yes"
Usage: python3 -m venv .venv-tts && .venv-tts/bin/pip install gtts && .venv-tts/bin/python scripts/make-test-audio.py
Nothing personal is recorded: no human voice, no real name.
"""
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    from gtts import gTTS
except ImportError:
    sys.exit("pip install gtts first (see the docstring)")

LINES = [
    ("fr", "Je pars à Bali lundi pour le mariage d'un ami", "fr-bali-mariage.wav"),
    ("en", "yes", "en-yes.wav"),
]
out = Path(__file__).resolve().parent.parent / "fixtures" / "audio"
out.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory() as tmp:
    for lang, text, name in LINES:
        mp3 = Path(tmp) / f"{name}.mp3"
        gTTS(text, lang=lang).save(str(mp3))
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(mp3), "-ar", "16000", "-ac", "1", str(out / name)], check=True)
        print("wrote", out / name)
