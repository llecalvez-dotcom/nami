# Audio fixtures (ticket 0)

Two synthetic voices for the bench's voice check (`scripts/bench/run.mjs` sends them to `/api/voice/transcribe`, Gladia):

| File | Says | Expected in the transcript |
|---|---|---|
| `fr-bali-mariage.wav` | « Je pars à Bali lundi pour le mariage d'un ami » | `Bali`, language `fr` |
| `en-yes.wav` | "yes" | `yes`, language `en` |

Made by `scripts/make-test-audio.py` (gTTS, then ffmpeg to 16 kHz mono WAV). No human voice, no personal data.
