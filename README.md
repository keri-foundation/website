# General information

This repo contains information about and backups of <https://keri.foundation>.

The repository does not include the full WordPress core files. It includes the site database export backup in ZIP format, password-protected.

## Managing the website

Go to https://hpanel.hostinger.com/

## Conference galleries (`/confs/<ORG>/<YEAR>/<month>/`)

One folder per conference; the server mirrors this tree. A folder that is missing simply means that part does not exist for that conference (e.g. SEDI 2025 has no interviews).

```text
confs/
├── KERI/2026/apr/                  → https://keri.foundation/confs/KERI/2026/apr/
│   ├── index.html                  gallery app (copy of the template)
│   ├── index.json                  page copy, video list, paths
│   ├── talks/                      *.mp4 + *.mp3 + *.srt side by side
│   ├── interviews/                 *.mp4 + *.mp3 + *.srt side by side
│   ├── slides/                     *.pdf
│   ├── promo/                      promo.mp4, promo.jpg
│   └── transcripts/
│       ├── html/talks/             generated static transcript pages
│       ├── html/interviews/        generated (when interviews exist)
│       └── pdf/talks/              concatenated transcript PDFs
├── SEDI/2025/nov/                  → https://keri.foundation/confs/SEDI/2025/nov/
│   ├── talks/                      morning-…, lunch-…, afternoon-… (one folder)
│   ├── promo/                      poster
│   ├── speaker-photos/
│   └── transcripts/
│       ├── html/talks/
│       └── pdf/talks/
├── template-presentations-landingpage/   generic starting point for a new conference
└── 2026/videos/                    legacy layout, kept until the new layout is live
```

`index.json` → `transcriptsDir` (`transcripts/html`) tells both the gallery and the generator where HTML transcript pages live: `<transcriptsDir>/<folder of the .srt>/<video-id>.html` (e.g. `transcripts/html/talks/…`). Concatenated PDFs go under `transcripts/pdf/talks/`.

### New conference

1. Create `confs/<ORG>/<YEAR>/<month>/` and copy `index.html` + `index.json` from `confs/template-presentations-landingpage/`.
2. Add media to `talks/` (and `interviews/`, `slides/`, … when present) and fill in `index.json`.
3. Adjust the static transcript links (`<nav class="seo-transcript-links">`) in `index.html`.
4. Edit `.srt` files in that conference folder. `scripts/subtitle-sources.tsv` is only for an optional copy from somewhere else.

### Build and deploy

    scripts/deploy-confs.sh build            # subtitles → transcript pages → verify (local only)
    scripts/deploy-confs.sh -n push          # preview what would be uploaded
    scripts/deploy-confs.sh deploy           # build + push (rsync --delete) + check the live site
    scripts/deploy-confs.sh check-remote     # HEAD-request every referenced file on keri.foundation
    scripts/deploy-confs.sh --conf SEDI/2025/nov push

### Legacy gallery URLs

Old gallery entry paths keep a small static `index.html` with one link to the new location (no `.htaccess` redirects — LiteSpeed often ignored those):

- `/confs/2026/videos/` → `/confs/KERI/2026/apr/`
- `/confs/2026/videos/SEDI/2025-11-SEDI/` → `/confs/SEDI/2025/nov/`

    scripts/deploy-confs.sh push-legacy-moved   # upload those two index.html pages

Old media under `/confs/2026/videos/` may still answer at their old URLs until that tree is removed. Loose videos there with no new home yet: Introduction to KERI, KSWG.

## Subtitles and scripts

This repository is the only place conference subtitles are edited. Files live next to the media, for example `confs/KERI/2026/apr/talks/*.fixed.srt`. `scripts/deploy-confs.sh build` regenerates the static transcript HTML from those files.

Tools in `scripts/` (install once with `npm install` inside `scripts/`):

    node scripts/build-transcript-pdf.js KERI/2026/apr
    node scripts/remove-rolling-subtitles.js confs/KERI/2026/apr/talks
    bash scripts/upload-youtube-subs.sh 'PLAYLIST_URL' confs/KERI/2026/apr/talks
    bash scripts/fetch.sh          # pull the live site into this checkout
    python3 scripts/generate_policy_brief_pdf.py

YouTube OAuth setup: `scripts/YOUTUBE_UPLOADER_SETUP.md`. Caption drafts still come from the separate subtitle machine, not from this repo.

Unpublished extras that are not on a gallery live under `confs/_archive/` (not deployed).

