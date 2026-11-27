# keri.foundation

## Contents

- [keri.foundation](#kerifoundation)
  - [Contents](#contents)
  - [General information](#general-information)
  - [Managing the website](#managing-the-website)
  - [WordPress](#wordpress)
  - [Learning site (`/edu/`)](#learning-site-edu)
  - [Kerisse (`/kerisse/`)](#kerisse-kerisse)
  - [Various (`/various/`)](#various-various)
  - [Site customizations (`/custom/`)](#site-customizations-custom)
  - [Video galleries (`/v/`)](#video-galleries-v)
  - [Conference galleries (`/v/confs/<ORG>/<YEAR>/<month>/`)](#conference-galleries-vconfsorgyearmonth)
    - [Top clips (`topClips`)](#top-clips-topclips)
    - [Chapters (`videos[].chapters`)](#chapters-videoschapters)
    - [Talk summaries](#talk-summaries)
  - [Sessions (`/v/sessions/<YEAR>/<month>/`)](#sessions-vsessionsyearmonth)
    - [New conference](#new-conference)
    - [Build and deploy](#build-and-deploy)
    - [Dependencies (`ffmpeg` / `ffprobe`)](#dependencies-ffmpeg--ffprobe)
    - [Overviews and directory listings (`/v/`, `/v/confs/`, `/v/sessions/`)](#overviews-and-directory-listings-v-vconfs-vsessions)
    - [Old gallery URLs (`/confs/`, `/vids/`)](#legacy-gallery-urls)
  - [Subtitles](#subtitles)
    - [Scripts](#scripts)
  - [Video submission guide](#video-submission-guide)
  - [YouTube subtitle upload setup](#youtube-subtitle-upload-setup)
    - [Step 1: Create a Google Cloud Project](#step-1-create-a-google-cloud-project)
    - [Step 2: Create OAuth2 Credentials](#step-2-create-oauth2-credentials)
    - [Step 3: First upload](#step-3-first-upload)
    - [Usage](#usage)
    - [Known playlists](#known-playlists)
    - [How it works](#how-it-works)
    - [Troubleshooting](#troubleshooting)

## General information

[https://keri.foundation](https://keri.foundation) runs on Hostinger. The live document root and this repository are different trees. This checkout versions `custom/`, `v/` (the video galleries), `scripts/`, and the site-root `.htaccess`. WordPress itself, plus `/edu/`, `/kerisse/`, and `/various/`, live on the host and are maintained from their own projects. Database dumps and other archives are not tracked in git.

Remote document root:

```text
public_html/
├── .htaccess                  WordPress permalinks, plus the /videos/ redirect tracked here
├── index.php                  WordPress front controller
├── license.txt                WordPress license
├── readme.html                WordPress readme
├── wp-activate.php            WordPress entry points
├── wp-blog-header.php
├── wp-comments-post.php
├── wp-config.php              live config; stays on the server
├── wp-config-sample.php
├── wp-cron.php
├── wp-links-opml.php
├── wp-load.php
├── wp-login.php
├── wp-mail.php
├── wp-settings.php
├── wp-signup.php
├── wp-trackback.php
├── xmlrpc.php
├── wp-admin/                  WordPress admin
├── wp-content/                themes, plugins, uploads
├── wp-includes/               WordPress core
├── digistate_logo.jpg
├── v/                         every recorded video — described below
│   ├── confs/                 conference galleries
│   └── sessions/              other talks and sessions
├── custom/                    WordPress look-and-feel — described below
├── edu/                       KERI Learning Hub (kerioke)
├── kerisse/                   Kerisse search index and dataset
└── various/                   various things
```

| Path | Role |
| ---- | ---- |
| WordPress (`wp-admin/`, `wp-content/`, `wp-includes/`, the `wp-*.php` files, `.htaccess`, `index.php`) | The site |
| `v/` | Entry point for every recorded video (`/v/`): an overview of all galleries |
| `v/confs/` | Conference galleries: videos, audio, subtitles, slides, promo, transcripts |
| `v/sessions/` | Other talks and sessions (`/v/sessions/<YEAR>/<month>/`), same media layout as `v/confs/` |
| `custom/` | Stylesheet, page scripts, and the `[kc_banner]` shortcode, served from the document root |
| `edu/` | Static KERI learning site, built and deployed from the kerioke project |
| `kerisse/` | Search-index shards and the scraped corpus for the Kerisse search engine |
| `various/` | Various things |

`custom/` belongs to the WordPress site. `v/` is a separate static tree beside WordPress.

## Managing the website

Site administration is in Hostinger hPanel. Deploy scripts use the local SSH host alias `kerifoundation` (user, host, and port stay in `~/.ssh/config`).

## WordPress

WordPress is installed in the document root. Administration is `wp-admin/`, core libraries are `wp-includes/`, and themes, plugins, and uploads are `wp-content/`. The usual entry points (`index.php`, `wp-login.php`, `wp-cron.php`, `xmlrpc.php`, and the rest of the `wp-*.php` files) sit next to them, along with `license.txt` and `readme.html`. `wp-config.php` stays on the server.

`bash scripts/fetch-wordpress.sh` pulls that WordPress tree, and `custom/`, into this checkout. It leaves `v/` alone.

<a id="learning-site-edu"></a>

## Learning site (`/edu/`)

[https://keri.foundation/edu](https://keri.foundation/edu) is the KERI Learning Hub: tutorials, explanations, concept cards, learning modules, and H5P interactive video. It is a static Nuxt site from the **kerioke** project. Production is generated with base path `/edu/` (`generate:deploy` in that project) and deployed by `live.sh`, which rsyncs the build into `public_html/edu`.

On a local kerioke checkout, `public/confs` (a symlink to this checkout’s `v/confs/`) and `videos` let media play at `localhost`. On this host `/confs/…` answers with a 301 to `/v/confs/…`, and `/videos/` is WordPress. `live.sh` removes the symlink copies from the build output before upload, so a learning-site deploy leaves the galleries in place.

<a id="kerisse-kerisse"></a>

## Kerisse (`/kerisse/`)

`/kerisse/` holds data for the Kerisse search engine. Search runs in the browser. At build time, scraped JSONL entries are compiled into one gzipped MessagePack Orama index per category, plus a manifest. The kerisse git repo does not store that corpus or those shards; they are uploaded here.

- `https://keri.foundation/kerisse/search-index/` — shards the search UI downloads (`manifest.json`, then one `.orama.msgpack.gz` per category)
- `https://keri.foundation/kerisse/dataset/` — the full scraped corpus

The search UI is published with GitHub Actions (webpack only) and loads the shards from `search-index/`. The Repository shard is over GitHub’s 100 MB file limit, so the index is hosted here. Upload from the kerisse project with `npm run upload:search-data`. That script also installs a CORS `.htaccess` on `search-index/` and `dataset/`. The files are static.

<a id="various-various"></a>

## Various (`/various/`)

`/various/` holds various things.

<a id="site-customizations-custom"></a>

## Site customizations (`/custom/`)

WordPress look-and-feel and small page behaviors that sit outside the theme. The live site serves this tree from the document root (`https://keri.foundation/custom/`). It layers on Twenty Twenty-Five: a stylesheet, a few page scripts, and one shortcode.

```text
custom/
├── css/
│   ├── index.css                 stylesheet entry point
│   ├── _variables.css            design tokens (colors, type, spacing)
│   ├── _logo.css                 header logo size
│   ├── _base.css                 theme overrides
│   ├── _base.extra.css           page background and header
│   ├── _typography.css
│   ├── _forms.css                WPForms and Contact Form 7
│   ├── _updates.css              announcement / update tables
│   ├── _mobile-menu.css          responsive navigation
│   ├── _layout.css               present; not imported by index.css
│   ├── _blocks.css               present; import commented out
│   └── _components.css           present; import commented out
├── js/
│   ├── index.js                  calls the modules below
│   └── modules/
│       ├── countdown.js          countdown on elements with class "countdown"
│       ├── tables-font-size-resizer.js
│       └── tables-show-hide-rows-and-columns.js
└── kc-banner-shortcode.php       [kc_banner] shortcode
```

`css/index.css` is the file that gets loaded. It imports the partials above, plus menu icons from `https://kericonf.com/custom/css/_menu-icons.css`. `_layout.css`, `_blocks.css`, and `_components.css` are in the folder but are not part of that stylesheet (`_blocks.css` and `_components.css` are commented out in `index.css`).

`js/index.js` exports `initialize()`, which wires up:

- show/hide controls on table rows and columns (state kept in `localStorage`)
- a font-size control for those tables
- a countdown (21 April 2026, 22:00) prepended to any element with class `countdown`

`kc-banner-shortcode.php` registers `[kc_banner]`. The shortcode shows a banner preview, the escaped HTML, and a copy button. Install it by copying the file to `wp-content/plugins/kc-banner/kc-banner.php` and activating the plugin, or by pasting the functions into the theme’s `functions.php`.

<a id="video-galleries-v"></a>

## Video galleries (`/v/`)

[https://keri.foundation/v/](https://keri.foundation/v/) is the entry point for every recorded video, talk, and session. It lists all galleries, newest first. Below it are two trees that share one gallery app:

```text
v/
├── .htaccess                       Options -Indexes, DirectoryIndex index.html
├── overview.json                   page copy for the /v/ overview
├── index.html                      generated overview of every gallery
├── sitemap.xml                     generated; listed in robots.txt
├── confs/                          conferences: confs/<ORG>/<YEAR>/<month>/
└── sessions/                       other talks: sessions/<YEAR>/<month>/
```

These used to be `/confs/` and `/vids/`. Every old URL still works through a 301 (see [Old gallery URLs](#legacy-gallery-urls)).

<a id="conference-galleries"></a>
<a id="conference-galleries-confsorgyearmonth"></a>

## Conference galleries (`/v/confs/<ORG>/<YEAR>/<month>/`)

One folder per conference; the server mirrors this tree. A folder that is missing simply means that part does not exist for that conference (e.g. SEDI 2025 has no interviews).

```text
v/confs/
├── .htaccess                       directory listing rewrite (see below)
├── overview.json                   page copy for the /v/confs/ overview
├── index.html                      generated overview of conference galleries
├── index.php                       folder browser for bare subdirectories
├── KERI/2026/apr/                  → https://keri.foundation/v/confs/KERI/2026/apr/
│   ├── index.html                  gallery app (synced from the template on build)
│   ├── index.json                  page copy, video list, paths
│   ├── talks/                      *.mp4 + *.mp3 + *.srt side by side
│   ├── interviews/                 *.mp4 + *.mp3 + *.srt side by side
│   ├── slides/                     *.pdf
│   ├── promo/                      promo.mp4, promo.jpg
│   └── transcripts/
│       ├── html/talks/             generated static transcript pages
│       ├── html/interviews/        generated (when interviews exist)
│       └── pdf/talks/              concatenated transcript PDFs
├── SEDI/2025/nov/                  → https://keri.foundation/v/confs/SEDI/2025/nov/
│   ├── talks/                      morning-…, lunch-…, afternoon-… (one folder)
│   ├── promo/                      poster
│   ├── speaker-photos/
│   └── transcripts/
│       ├── html/talks/
│       └── pdf/talks/
└── template-presentations-landingpage/   shared gallery shell and overview template
    ├── index.html                  gallery app, copied into every gallery on build
    ├── index.json                  example gallery config
    ├── brand.json                  site name, icons, share image, wave, and colors
    ├── overview.html               overview shell for /v/, /v/confs/, and /v/sessions/
    └── overview.json               example overview config
```

`index.json` → `transcriptsDir` (`transcripts/html`) tells both the gallery and the generator where HTML transcript pages live, for example `transcripts/html/talks/<video-id>.html`. Concatenated PDFs go under `transcripts/pdf/talks/`.

`build` / `deploy` always copy `v/confs/template-presentations-landingpage/index.html` over each gallery’s `index.html` (conference and session galleries alike). Edit the template only; page copy and the header `nav` live in each gallery’s `index.json`. The top-left links (Home, All videos, Conference index, Other videos) come from `brand.json` → `galleryLinks`, the same on every gallery and on the three overviews. Talk, interview, and PDF links are added when those files exist under `transcripts/`. That copy step writes the page header and those links into the HTML, and stamps the rest of the site chrome from `v/confs/template-presentations-landingpage/brand.json` (name, icons, share image, wave, colors). A gallery may override that with its own `brand` object. See `v/confs/template-presentations-landingpage/index.json` for a full example shape. Paths in `brand.json` that start with `/` are site-root paths; the stamp turns icon and share-image URLs into absolute links with `SITE_URL`.

The same step writes `v/index.html`, `v/confs/index.html`, and `v/sessions/index.html` from `overview.html`. Page copy for those overviews lives in `v/overview.json`, `v/confs/overview.json`, and `v/sessions/overview.json` (copy `template-presentations-landingpage/overview.json` and tailor it; `scope` is `all`, `confs`, or `sessions`). Each card is filled from that gallery’s `index.json` (heading, subtitle, poster, video counts). Do not edit the generated `index.html` files by hand.

### Top clips (`topClips`)

Optional teaser row on the gallery. Set `topClips.enabled` and list clips under `topClips.clips`. Each clip needs:

| Field | Role |
| ----- | ---- |
| `videoTitle` | Must match a `videos[].title` in the same `index.json` |
| `speaker` / `talk` | Labels on the card |
| `start` / `end` | Clip range in the video (see below) |
| `quote` | Short quote shown on the card |

`start` and `end` accept either seconds or clock strings (same meaning either way):

| Form | Example | Meaning |
| ---- | ------- | ------- |
| Seconds (number or string) | `730` or `"730"` | 730 seconds |
| `MM:SS` / `M:SS` | `"12:10"` | 12 minutes 10 seconds |
| `HH:MM:SS` | `"00:12:10"` | same as above |
| Fractional seconds | `"12:10.5"` or `"00:12:10,500"` | optional |

```json
{
  "videoTitle": "Opening - Christopher Bramwell",
  "speaker": "Christopher Bramwell",
  "talk": "Opening",
  "start": "00:12:10",
  "end": "00:12:26",
  "quote": "Identity belongs to the person, not to the government."
}
```

Clips with unparseable times or `end` ≤ `start` are skipped. Numeric seconds remain valid.

### Chapters (`videos[].chapters`)

Optional jump list on a talk card and in the full-screen player. Add a `chapters` array on any `videos[]` entry:

| Field | Role |
| ----- | ---- |
| `start` | Chapter start (same clock / seconds forms as `topClips`) |
| `description` | Label shown next to the timestamp (`title` is accepted as an alias) |

```json
{
  "start": "14:44",
  "description": "Why KERI does not need AI to defend against AI"
}
```

A **Chapters** button on the talk card (and in the full-screen player) opens a slide-up sheet on mobile / centered panel on larger screens. Choosing a chapter seeks that video, plays from there, updates the URL hash (`&t=`), and closes the sheet. Chapters with unparseable times or an empty description are skipped. See `v/sessions/2026/jul/index.json` (“It's KERI or Surveillance”) for a full example.

### Talk summaries

Optional. A summary is a sibling of the media file, same basename, Markdown:

```text
talks/2026-11-02-kent-bull.mp4
talks/2026-11-02-kent-bull.md
```

The same rule applies in `interviews/` and in any later media folder: `path` ending in `.mp4` or `.mp3` looks for that path with `.md`. Nothing in `index.json` points at the file. If the file is missing, or empty, that video simply has no summary. `landing-pages` writes the text into the gallery `index.html` as real HTML (so a crawler sees it, and the page script moves it onto the talk card). `transcripts` puts the same text at the top of that talk’s transcript page and uses the opening as the page description. Those transcript pages are already in the sitemap. `pdfs` prints the same summary at the start of that talk’s chapter in All Transcripts (PDF). A talk with no summary file is unchanged in all three.

Write plain paragraphs separated by a blank line, about 200 words. A block that is only a Markdown heading is ignored. Inline Markdown is not interpreted.

<a id="yearly-videos"></a>
<a id="videos-vidsyearmonth"></a>
<a id="sessions-vsessionsyearmonth"></a>

## Sessions (`/v/sessions/<YEAR>/<month>/`)

Same gallery app as the conferences, for talks and sessions that are not part of a conference. Layout matches `v/confs/<ORG>/<YEAR>/<month>/` (year and month folders; no org prefix). WordPress keeps `/videos/`.

```text
v/sessions/
├── .htaccess                       directory listing rewrite
├── overview.json                   page copy for the /v/sessions/ overview
├── index.html                      generated overview of month galleries
├── index.php                       folder browser for bare subdirectories
├── 2020/, 2024/, 2026/             index.html forwarding old year-gallery #talk-id links
├── 2020/jul/                       → https://keri.foundation/v/sessions/2020/jul/
├── 2024/jan/                       → https://keri.foundation/v/sessions/2024/jan/
├── 2026/may/                       → https://keri.foundation/v/sessions/2026/may/
├── 2026/jul/                       → https://keri.foundation/v/sessions/2026/jul/
└── 2026/nov/                       → https://keri.foundation/v/sessions/2026/nov/
    ├── index.html                  gallery app (synced from the template on build)
    ├── index.json                  page copy and video list
    ├── talks/                      *.mp4 + *.mp3 + *.srt side by side
    └── transcripts/
        ├── html/talks/             generated static transcript pages
        └── pdf/talks/              sessions-<YEAR>-<month>-Transcripts.pdf
```

The year pages (`v/sessions/2026/index.html` and friends) forward old hash links such as `/vids/2026/#it-s-keri-or-surveillance-samuel-smith` to the month gallery in the browser, after the server’s 301 from `/vids/2026/` to `/v/sessions/2026/`.

### New conference

1. Create `v/confs/<ORG>/<YEAR>/<month>/` and copy `index.json` from `v/confs/template-presentations-landingpage/` (edit page copy, nav, `transcriptLinks`, videos there). Links to other galleries use the `/v/…` paths.
2. Add media to `talks/` (and `interviews/`, `slides/`, … when present) and fill in `index.json`. `build` writes a podcast `.mp3` next to each `.mp4` when that `.mp3` is not there yet.
3. Run `scripts/deploy-confs.sh landing-pages` (or `build`) so `index.html` is copied from the template and the `/v/` and `/v/confs/` overviews are rewritten.
4. Edit `.srt` files in that conference folder. `scripts/subtitle-sources.tsv` is only for an optional copy from somewhere else.

### Build and deploy

```bash
scripts/deploy-confs.sh landing-pages    # sync gallery index.html, and write the /v/, /v/confs/, /v/sessions/ overviews
scripts/deploy-confs.sh build            # landing-pages → audio → subtitles → transcripts → sitemap → pdfs → verify
scripts/deploy-confs.sh audio            # podcast MP3 beside each MP4 that does not have one yet
scripts/deploy-confs.sh verify           # referenced files exist locally
scripts/deploy-confs.sh unused           # list files not reached from any gallery page
scripts/deploy-confs.sh verify-videos    # optional gallery MP4 encode checks (needs ffprobe; not in build/deploy)
scripts/deploy-confs.sh -n push          # preview what would be uploaded
scripts/deploy-confs.sh deploy           # build + push (rsync --delete) + check the live site
scripts/deploy-confs.sh check-remote     # HEAD-request every referenced file on keri.foundation, then check-redirects
scripts/deploy-confs.sh check-redirects  # old /confs/ and /vids/ URLs must 301 once to a working /v/ URL
scripts/deploy-confs.sh --conf KERI/2026/nov deploy
scripts/deploy-confs.sh --conf SEDI/2025/nov push
scripts/deploy-confs.sh --conf sessions/2026/jul push
```

`--conf` takes a gallery id. Conference ids are relative to `v/confs/`: `KERI/2026/nov`. Session ids keep their tree name: `sessions/2026/jul`. The site paths (`v/confs/KERI/2026/nov`, `v/sessions/2026/jul`) and the old ids (`confs/KERI/2026/nov`, `vids/2026/jul`) are accepted too and mean the same gallery.

`audio` (included in `build` and `deploy`) writes `talks/foo.mp3` from `talks/foo.mp4` when that MP3 is absent. The encode is mono, 44.1 kHz, 64 kbps MP3: about 28 MB per hour, clear enough for a spoken-word podcast. It needs `ffmpeg` with LAME. MP3s are gitignored; `push` uploads them with the gallery. An MP4 that is not on this machine is skipped, and `verify` still reports that file missing.

`verify` (included in `build` and `deploy`) checks that every file referenced by each gallery `index.json` exists locally.

`unused` lists gallery files that nothing on the gallery page points at — `index.json` fields plus the talk / interview / PDF links `landing-pages` stamps into the nav (same rules as the unused lines from `verify`). It does not check for missing references. Use `--conf` to limit to one gallery.

`verify-videos` is optional and **not** part of `build` or `deploy`. Run it when you want encode checks: for each local gallery `.mp4` it uses `ffprobe` to enforce the technical rules in [VIDEO_SUBMISSION_GUIDE.md](VIDEO_SUBMISSION_GUIDE.md) (H.264 High level 3.1–4.2, 720p, ~1.5–2.5 Mbps video, AAC stereo, size/hour, fast-start `moov` before `mdat`, and a few filename-character rules). Missing MP4s are skipped. Soft issues such as audio slightly under 128 kbps are warnings; hard mismatches exit non-zero.

### Dependencies (`ffmpeg` / `ffprobe`)

Gallery `audio`, `build`, and `deploy` need `ffmpeg`. Optional `verify-videos` also needs `ffprobe` (same install):

| Tool | Used for |
| ---- | -------- |
| `ffmpeg` | Podcast MP3s from gallery MP4s (`audio`); needs the `libmp3lame` encoder |
| `ffprobe` | Optional gallery MP4 encode checks (`verify-videos`); ships with FFmpeg |

Install:

```bash
# macOS (Homebrew)
brew install ffmpeg

# Debian / Ubuntu
sudo apt update && sudo apt install ffmpeg

# Fedora
sudo dnf install ffmpeg
```

Confirm both binaries are available:

```bash
ffmpeg -version
ffprobe -version
```

On macOS, Homebrew’s `ffmpeg` formula includes `ffprobe` and LAME.

`push` and `deploy` also upload the site-root `.htaccess` (all redirects from old URLs), `robots.txt`, and `v/sitemap.xml`, plus the tree indexes: `v/.htaccess` and `v/index.html`, then `.htaccess`, `index.php`, and `index.html` under both `v/confs/` and `v/sessions/`. A full push mirrors every `v/confs/<ORG>/` folder and the whole `v/sessions/` tree. `--conf` limits the gallery mirror; the site-root `.htaccess`, `robots.txt`, the sitemap, and the tree indexes are still uploaded. `push` stops before uploading anything while the server still has a `confs/` or `vids/` folder in the document root (see [Old gallery URLs](#legacy-gallery-urls)).

`sitemap` (included in `build` and `deploy`) writes `v/sitemap.xml` from the gallery `index.json` files. It lists the three overviews, gallery pages, transcript indexes, and transcript HTML. Slides, video, and audio are left out. `robots.txt` in the site root is a real file (it replaces WordPress’s generated one) and names that sitemap plus the WordPress sitemap.

<a id="overviews-and-directory-listings-confs-vids"></a>

### Overviews and directory listings (`/v/`, `/v/confs/`, `/v/sessions/`)

`/v/` (every gallery), `/v/confs/`, and `/v/sessions/` are static overview pages in the same visual style as a gallery. `landing-pages` (and therefore `build` / `deploy`) writes them from `v/confs/template-presentations-landingpage/overview.html`. Edit `v/overview.json`, `v/confs/overview.json`, or `v/sessions/overview.json` for the heading, subtitle, optional `introduction` (lead copy below the masthead), nav, and footer. Cards are built from each gallery’s `index.json` and listed newest first.

Below the introduction, each overview lists every talk and interview in that tree, with filters for title, speaker, event (the gallery heading: congress or session), and date (the gallery month, or the day when the media filename starts with `YYYY-MM-DD`). A title opens the existing gallery URL with the same hash the gallery already uses (`#` plus the slug of `videos[].title`). Those paths are not rewritten. Each `videos[]` entry has `speakers`, an array of people, in both conference and session galleries. The overview speaker filter uses that array. `topClips[].speaker` stays a single clip label.

Hostinger runs **LiteSpeed**, not Apache. LiteSpeed’s built-in autoindex HTML-escapes `HEADER.html` and ignores `AutoIndexUri` in `.htaccess`, so folders that are not a gallery still need a PHP listing.

| File | Role |
| ---- | ---- |
| `overview.json` | Page copy for that tree’s overview. Not uploaded. |
| `index.html` | Generated overview. Do not edit by hand. |
| `.htaccess` | `Options -Indexes`, `DirectoryIndex index.html index.php`, rewrite bare subdirs to `index.php?path=…` |
| `index.php` | Dark-themed folder list for bare subdirectories (dirs first; media/config file types hidden) |

`RewriteBase` must match the public URL of that tree (`/v/confs/` or `/v/sessions/`). The PHP script derives link prefixes from its location under `DOCUMENT_ROOT`, so the same `index.php` works in either tree—only `.htaccess`’s `RewriteBase` must differ. `v/` itself has no `index.php`; its only subfolders are the two trees.

Behaviour:

- `/v/`, `/v/confs/`, and `/v/sessions/` serve the generated `index.html` (`DirectoryIndex` prefers it over `index.php`).
- A directory **with** its own `index.html` (a gallery) or its own `index.php` is left alone.
- A bare directory (e.g. `/v/confs/KERI/`, `/v/confs/KERI/2026/`) is rewritten to that tree’s `index.php`.
- Entries named in the script’s ignore list are omitted (including `template-presentations-landingpage` under `v/confs/`).

Do not rely on `HEADER.html` or LiteSpeed `AutoIndexUri` on this host.

### Old gallery URLs (`/confs/`, `/vids/`)

The galleries lived at `/confs/` and `/vids/` before `/v/`. Neither folder exists on the server any more, so the site-root `.htaccess` (block `BEGIN media redirects`, kept outside the WordPress block) answers every old URL with a 301:

- `/confs/…` → `/v/confs/…` and `/vids/…` → `/v/sessions/…`, same path below the prefix.
- Older layouts go straight to their final URL in one hop, for example `/confs/2026/videos/` → `/v/confs/KERI/2026/apr/`, `/confs/2026/videos/SEDI/2025-11-SEDI/` → `/v/confs/SEDI/2025/nov/`, and year-level `/vids/2026/talks/…` → the month gallery. Deep links (talk media, subtitles, transcripts, slides, promo) are mapped the same way.
- `/videos/sam-smith/Its-KERI-or-Surveillance/Its-KERI-or-Surveillance.html` → `/v/sessions/2026/jul/#it-s-keri-or-surveillance-samuel-smith`.
- `/confs/sitemap.xml` and `/vids/sitemap.xml` → `/v/sitemap.xml`. Session transcript PDFs were named after the old id (`vids-2026-jul-Transcripts.pdf`); those URLs redirect to `sessions-2026-jul-Transcripts.pdf`.

`scripts/deploy-confs.sh check-redirects` tests this: for every file each gallery references it requests the old URL, and it adds one real example per hand-written rule from `scripts/legacy-redirects.tsv`. Each must return one 301 to the expected `/v/` URL, and that URL must return 200. It runs at the end of `deploy` (as part of `check-remote`). To try the rules before deploying, serve this checkout with the macOS Apache and point the check at it:

```bash
scripts/serve-local.sh start             # http://127.0.0.1:8099/ (no PHP)
SITE_URL=http://127.0.0.1:8099 scripts/deploy-confs.sh check-redirects
scripts/serve-local.sh stop
```

Moving the server tree (done once, by hand, so `push` does not upload every MP4 again under a new path):

```bash
ssh kerifoundation "cd domains/keri.foundation/public_html && mkdir -p v && mv confs v/confs && mv vids v/sessions"
scripts/deploy-confs.sh deploy
```

Run `deploy` right after the move: until the new site-root `.htaccess` is uploaded, old URLs return 404. `push` refuses to run while `confs/` or `vids/` still exist on the server. The rename of the session PDFs means `push` replaces five small `vids-*-Transcripts.pdf` files with `sessions-*` copies; no media is re-uploaded. Leftovers from the older `/confs/2026/` tree end up in `v/confs/2026/`, which `push` never touches; old URLs that are not covered by a specific rule still reach them through the prefix rule.

## Subtitles

Curated captions for the conference galleries live in this repository, next to the videos:

```text
v/confs/KERI/2026/apr/talks/          *.srt
v/confs/KERI/2026/apr/interviews/     *.srt
v/confs/SEDI/2025/nov/talks/          morning-|lunch-|afternoon-*.srt
```

Edit those files in place. `scripts/deploy-confs.sh build` regenerates the HTML transcript pages from them. There is no separate subtitles repository.

Stock speech-to-text often mangles KERI terms (“KERI” → “carry”, “KRAM” → “CRAM”, …). Generate drafts with the subtitle machine (not in this repo):

```bash
cd /path/to/KERI-subtitle-machine
./run.sh
# http://127.0.0.1:8765 — drop .mp4 files; captions land in that project’s output/
```

Copy a finished draft into the matching `v/confs/…` folder and clean it up. Keep the `.srt` name the gallery already references.

[Subtitle Edit](https://subtitleedit.github.io/subtitleedit/) is a fine editor.

Unpublished extras that are not on a gallery live under `confs/_archive/` (not deployed).

### Scripts

Install once with `npm install` inside `scripts/`:

```bash
node scripts/build-transcript-pdf.js KERI/2026/apr
node scripts/remove-rolling-subtitles.js v/confs/KERI/2026/apr/talks
node scripts/detect-nonsense-subtitles.js v/confs/KERI/2026/apr/interviews
bash scripts/upload-youtube-subtitles.sh 'PLAYLIST_URL' v/confs/KERI/2026/apr/talks
bash scripts/fetch-wordpress.sh  # pull live WordPress (not v/)
python3 scripts/generate_policy_brief_pdf.py
```

`puppeteer-core` (used by the transcript PDF builder) drives your locally installed Chrome; it does not download a browser. YouTube OAuth setup is below.

## Video submission guide

Follow these rules when submitting videos so files stay consistent and easy to find.

Go to [video submission guide](VIDEO_SUBMISSION_GUIDE.md)

## YouTube subtitle upload setup

To upload fixed subtitles to YouTube, you need to set up OAuth2 credentials from Google Cloud.

### Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)
3. Enable the **YouTube Data API v3**:
  - Go to "APIs & Services" → "Library"
  - Search for "YouTube Data API"
  - Click "Enable"

### Step 2: Create OAuth2 Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth 2.0 Client IDs"
3. If prompted, configure the OAuth consent screen first:
  - User Type: External
  - Add your email as a test user
4. For Application type, select **"Desktop application"**
5. Click "Create"
6. Download the OAuth client JSON (Google's UI varies):
  - In the success popup after creating the client, click **Download JSON**
  - Or in the Credentials list, find your OAuth client and click the download icon at the far right
  - Or open the client details and use **Download JSON** there
7. Save the downloaded file as `.youtube-client-secret.json` in the kerifoundation repo root (gitignored)

### Step 3: First upload

From the repo root, after `npm install` in `scripts/`:

```bash
bash scripts/upload-youtube-subtitles.sh 'https://www.youtube.com/playlist?list=PLnHy2ee5UksOfPng7BGEN-XNVupzXpgSL' v/confs/KERI/2026/apr/talks
```

**First time only:**

- Your browser automatically opens to log in with your Google account
- If the browser doesn't open, copy the URL from the terminal
- Sign in with your YouTube account (2FA is supported)
- Grant permission to manage your YouTube captions
- The callback should return to `http://localhost:3000/oauth2callback`; if you see plain `http://localhost/`, the OAuth redirect URI is not matching this app's local server
- You'll be redirected back, and credentials are automatically saved to `.youtube-credentials.json` (gitignored)

**Subsequent uploads:**

- Your saved credentials are reused automatically
- No browser login needed

### Usage

From the kerifoundation repo root (after `npm install` in `scripts/`):

```bash
bash scripts/upload-youtube-subtitles.sh 'https://www.youtube.com/playlist?list=PLnHy2ee5UksOfPng7BGEN-XNVupzXpgSL' v/confs/KERI/2026/apr/talks

# One file (English)
bash scripts/upload-youtube-subtitles.sh 'https://www.youtube.com/playlist?list=PLnHy2ee5UksOfPng7BGEN-XNVupzXpgSL' v/confs/KERI/2026/apr/talks --file 'Video Title.srt'

# One file (other language)
bash scripts/upload-youtube-subtitles.sh 'https://www.youtube.com/playlist?list=PLnHy2ee5UksOfPng7BGEN-XNVupzXpgSL' v/confs/KERI/2026/apr/talks --file 'Video Title.nl.srt'

# Force OAuth re-consent
bash scripts/upload-youtube-subtitles.sh 'https://www.youtube.com/playlist?list=PLnHy2ee5UksOfPng7BGEN-XNVupzXpgSL' v/confs/KERI/2026/apr/talks --reauth
```

### Known playlists

**KERI Conference April 2026**

```bash
# Day 1 talks
bash scripts/upload-youtube-subtitles.sh 'https://www.youtube.com/playlist?list=PLnHy2ee5UksOfPng7BGEN-XNVupzXpgSL' v/confs/KERI/2026/apr/talks

# Day 2 talks
bash scripts/upload-youtube-subtitles.sh 'https://www.youtube.com/playlist?list=PLnHy2ee5UksMjwBseKJ7ivXiYukRvI65a' v/confs/KERI/2026/apr/talks

# Interviews (use the playlist that contains the interview videos)
bash scripts/upload-youtube-subtitles.sh 'https://www.youtube.com/playlist?list=PLnHy2ee5UksOfPng7BGEN-XNVupzXpgSL' v/confs/KERI/2026/apr/interviews
bash scripts/upload-youtube-subtitles.sh 'https://www.youtube.com/playlist?list=PLnHy2ee5UksMjwBseKJ7ivXiYukRvI65a' v/confs/KERI/2026/apr/interviews
```

**KERI Mini Conference November 2026**

```bash
bash scripts/upload-youtube-subtitles.sh 'https://www.youtube.com/playlist?list=PLNq_uXoW6DaQ' v/confs/KERI/2026/nov/talks
```

### How it works

1. Fetches all videos from the YouTube playlist
2. Loads the conference `index.json` next to the media folder you passed (for example `v/confs/KERI/2026/nov/index.json` for `…/nov/talks`)
3. Matches each playlist video id to `videos[].youtubeId`, then uploads that entry’s subtitle file
4. Also uploads sibling language tracks that share the same basename stem (`*.nl.srt`, `*.es.srt`, …)
5. If a caption track for that language already exists, it updates it

Every uploadable gallery entry needs a `youtubeId`. Titles and filenames are not used for matching.

**Language filename convention**

- `stem.srt` → English (`en`)
- `stem.nl.srt` → Dutch (`nl`)
- `stem.es.srt` → Spanish (`es`)

`stem` is whatever the gallery already uses in `index.json` (a slug like `2026-11-02-kent-bull`, or a full talk title).

### Troubleshooting

**"Client secret not found"**

- Make sure you saved the credentials file as `.youtube-client-secret.json` in the kerifoundation repo root

**"I don't see a Download JSON button"**

- Make sure you created an **OAuth 2.0 Client ID** (not an API key)
- If you created the client already, open "APIs & Services" → "Credentials" and use the row download icon or open the client details page
- If still not shown, create a new client with Application type **Desktop application** and download from the creation popup

**"Invalid playlist URL"**

- Use the full URL: `https://www.youtube.com/playlist?list=PLAYLIST_ID`
- You can copy this from your browser address bar

**"No videos[].youtubeId match in index.json"**

- Add the YouTube video id as `videos[].youtubeId` in that conference’s `index.json`
- Check that `videos[].subtitle` points at a real file under the directory you passed
- For other languages, keep the same basename stem and add a language suffix, for example `2026-11-02-kent-bull.nl.srt`
- Edited subtitle files live next to the videos, for example `v/confs/KERI/2026/apr/talks/*.srt`
- Unchanged-hash skips say `(subtitle unchanged)`. Pass `--force` to upload even when the local hash is unchanged

**Authentication issues**

- Delete `.youtube-credentials.json` and try logging in again
- Make sure you granted permission to manage captions

**"Error: invalid_grant"**

- This usually means the saved refresh token was revoked or expired
- The uploader now auto-detects this, removes stale credentials, and prompts login again
- You can force a clean OAuth flow anytime with: `bash scripts/upload-youtube-subtitles.sh 'https://www.youtube.com/playlist?list=PLnHy2ee5UksOfPng7BGEN-XNVupzXpgSL' v/confs/KERI/2026/apr/talks --reauth`

**"Insufficient Permission" when uploading captions**

- Sign in with a Google account that has permission to edit subtitles/captions for that channel/video
- Delete `.youtube-credentials.json` and run upload again to re-consent with the required captions scope (`youtube.force-ssl`)
- In YouTube Studio, verify your account has the needed channel role (owner/editor with subtitle access)
- If videos are not on your channel, you will need explicit access on that channel to upload captions via API

**"Access blocked: ... has not completed the Google verification process"**

- Your OAuth consent screen is still in **Testing** mode
- Add the Google account you are signing in with as a **Test user** under **APIs & Services** → **OAuth consent screen** → **Test users**
- If you want anyone to be able to sign in, publish the consent screen to **Production** after completing Google's verification requirements
- If you just created the app, this is expected until the account is added as a test user
