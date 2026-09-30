# General information

This repo contains information about and backups of <https://keri.foundation>.

The repository does not include the full WordPress core files. It includes the site database export backup in ZIP format, password-protected.

## Managing the website

Go to https://hpanel.hostinger.com/websites/keri.foundation

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
4. Optional: add a subtitle source line in `scripts/subtitle-sources.tsv`.

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

## Legacy: fetching conference subtitles

Subtitle files can be fetched dynamically from the `keri-foundation/CONF26-subtitles` GitHub repository.

From the repo root, run:

    node confs/2026/videos/fetch-subtitles.js

This will create and update `confs/2026/videos/KERICONF26/subtitles/` with all `.srt` files currently present in the GitHub `subtitles/` folder.

If you hit GitHub API rate limits, set a `GITHUB_TOKEN` environment variable before running the script.

## Legacy: static transcript HTML (SEO)

Talk transcripts for search engines are generated as separate HTML pages (not via the gallery JavaScript). Generation lives in the `CONF26-subtitles` repo:

    cd /Users/kor/webdev/Blockchain-Bird/KERI/CONF26-subtitles
    npm run build:transcript-pages   # local HTML only
    npm run deploy:subtitles         # .srt + transcript HTML → local mirror + live server

Generated trees:

- `confs/2026/videos/KERICONF26/transcripts/`
- `confs/2026/videos/KERICONF26-interviews/transcripts/`
- `confs/2026/videos/SEDI/2025-11-SEDI/transcripts/`

The gallery `index.html` template is independent: redeploy it only when the app changes. Transcript pages regenerate whenever subtitle content is deployed.

