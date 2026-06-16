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

