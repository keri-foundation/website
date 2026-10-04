# Subtitles

Curated captions for the conference galleries live in this repository, next to the videos:

```text
confs/KERI/2026/apr/talks/          *.fixed.srt
confs/KERI/2026/apr/interviews/     *.srt
confs/SEDI/2025/nov/talks/          morning-|lunch-|afternoon-*.srt
```

Edit those files in place. `scripts/deploy-confs.sh build` regenerates the HTML transcript pages from them. There is no separate subtitles repository.

**Problem:** stock speech-to-text often mangles KERI terms (“KERI” → “carry”, “KRAM” → “CRAM”, …).

**Drafts:** generate them with the subtitle machine (not in this repo):

```bash
cd /path/to/KERI-subtitle-machine
./run.sh
# http://127.0.0.1:8765 — drop .mp4 files; captions land in that project’s output/
```

Copy a finished draft into the matching `confs/…` folder, clean it up, and for KERI talks keep the `*.fixed.srt` name the gallery already references.

Subtitle Edit is a fine editor: https://subtitleedit.github.io/subtitleedit/

YouTube upload, rolling-caption cleanup, and transcript PDFs are documented in the main `README.md` and live under `scripts/`.
