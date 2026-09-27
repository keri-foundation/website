# General information

This repo contains information about and backups of <https://keri.foundation>.

The repository does not include the full WordPress core files. It includes the site database export backup in ZIP format, password-protected.

## Managing the website

Go to https://hpanel.hostinger.com/

## Fetching conference subtitles

Subtitle files can be fetched dynamically from the `keri-foundation/CONF26-subtitles` GitHub repository.

From the repo root, run:

    node confs/2026/videos/fetch-subtitles.js

This will create and update `confs/2026/videos/KERICONF26/subtitles/` with all `.srt` files currently present in the GitHub `subtitles/` folder.

If you hit GitHub API rate limits, set a `GITHUB_TOKEN` environment variable before running the script.

## Static transcript HTML (SEO)

Talk transcripts for search engines are generated as separate HTML pages (not via the gallery JavaScript). Generation lives in the `CONF26-subtitles` repo:

    cd /path/to/CONF26-subtitles
    npm run build:transcript-pages   # local HTML only
    npm run deploy:subtitles         # .srt + transcript HTML → local mirror + live server

Generated trees:

- `confs/2026/videos/KERICONF26/transcripts/`
- `confs/2026/videos/KERICONF26-interviews/transcripts/`
- `confs/2026/videos/SEDI/2025-11-SEDI/transcripts/`

The gallery `index.html` template is independent: redeploy it only when the app changes. Transcript pages regenerate whenever subtitle content is deployed.

