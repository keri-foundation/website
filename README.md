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
  - [Conference galleries (`/confs/<ORG>/<YEAR>/<month>/`)](#conference-galleries-confsorgyearmonth)
    - [Top clips (`topClips`)](#top-clips-topclips)
  - [Yearly videos (`/vids/<YEAR>/`)](#yearly-videos-vidsyear)
    - [New conference](#new-conference)
    - [Build and deploy](#build-and-deploy)
    - [Overviews and directory listings (`/confs/`, `/vids/`)](#overviews-and-directory-listings-confs-vids)
    - [Legacy gallery URLs](#legacy-gallery-urls)
  - [Subtitles](#subtitles)
    - [Scripts](#scripts)
  - [Video submission guide](#video-submission-guide)
  - [YouTube uploader setup](#youtube-uploader-setup)
    - [Step 1: Create a Google Cloud Project](#step-1-create-a-google-cloud-project)
    - [Step 2: Create OAuth2 Credentials](#step-2-create-oauth2-credentials)
    - [Step 3: First upload](#step-3-first-upload)
    - [Usage](#usage)
    - [How it works](#how-it-works)
    - [Troubleshooting](#troubleshooting)

## General information

[https://keri.foundation](https://keri.foundation) runs on Hostinger. The live document root and this repository are different trees. This checkout versions `custom/`, `confs/`, `vids/`, `scripts/`, and the site-root `.htaccess`. WordPress itself, plus `/edu/`, `/kerisse/`, and `/various/`, live on the host and are maintained from their own projects. A password-protected database export ZIP may also be present at the repo root.

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
├── confs/                     conference galleries — described below
├── vids/                      yearly video galleries — described below
├── custom/                    WordPress look-and-feel — described below
├── edu/                       KERI Learning Hub (kerioke)
├── kerisse/                   Kerisse search index and dataset
└── various/                   various things
```

| Path | Role |
| ---- | ---- |
| WordPress (`wp-admin/`, `wp-content/`, `wp-includes/`, the `wp-*.php` files, `.htaccess`, `index.php`) | The site |
| `confs/` | Conference galleries: videos, audio, subtitles, slides, promo, transcripts |
| `vids/` | Yearly video galleries, same media layout, for recordings that are not a conference |
| `custom/` | Stylesheet, page scripts, and the `[kc_banner]` shortcode, served from the document root |
| `edu/` | Static KERI learning site, built and deployed from the kerioke project |
| `kerisse/` | Search-index shards and the scraped corpus for the Kerisse search engine |
| `various/` | Various things |

`custom/` belongs to the WordPress site. `confs/` and `vids/` are separate static trees beside WordPress.

## Managing the website

Go to [https://hpanel.hostinger.com/](https://hpanel.hostinger.com/)

## WordPress

WordPress is installed in the document root. Administration is `wp-admin/`, core libraries are `wp-includes/`, and themes, plugins, and uploads are `wp-content/`. The usual entry points (`index.php`, `wp-login.php`, `wp-cron.php`, `xmlrpc.php`, and the rest of the `wp-*.php` files) sit next to them, along with `license.txt` and `readme.html`. `wp-config.php` stays on the server.

`bash scripts/fetch-wordpress.sh` pulls that WordPress tree, and `custom/`, into this checkout. It leaves `confs/` and `vids/` alone.

<a id="learning-site-edu"></a>

## Learning site (`/edu/`)

[https://keri.foundation/edu](https://keri.foundation/edu) is the KERI Learning Hub: tutorials, explanations, concept cards, learning modules, and H5P interactive video. It is a static Nuxt site from the **kerioke** project. Production is generated with base path `/edu/` (`generate:deploy` in that project) and deployed by `live.sh`, which rsyncs the build into `public_html/edu`.

On a local kerioke checkout, `confs` and `videos` are symlinks so media plays at `localhost`. On this host those files already live at `/confs/` and `/videos/`. `live.sh` removes the symlink copies from the build output before upload, so a learning-site deploy leaves the galleries in place.

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

<a id="conference-galleries"></a>

## Conference galleries (`/confs/<ORG>/<YEAR>/<month>/`)

One folder per conference; the server mirrors this tree. A folder that is missing simply means that part does not exist for that conference (e.g. SEDI 2025 has no interviews).

```text
confs/
├── .htaccess                       directory listing rewrite (see below)
├── overview.json                   page copy for the /confs/ overview
├── index.html                      generated overview of conference galleries
├── index.php                       folder browser for bare subdirectories
├── KERI/2026/apr/                  → https://keri.foundation/confs/KERI/2026/apr/
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
├── SEDI/2025/nov/                  → https://keri.foundation/confs/SEDI/2025/nov/
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
    ├── overview.html               overview shell for /confs/ and /vids/
    └── overview.json               example overview config
```

`index.json` → `transcriptsDir` (`transcripts/html`) tells both the gallery and the generator where HTML transcript pages live, for example `transcripts/html/talks/<video-id>.html`. Concatenated PDFs go under `transcripts/pdf/talks/`.

`build` / `deploy` always copy `confs/template-presentations-landingpage/index.html` over each gallery’s `index.html`. Edit the template only; page copy, nav, and transcript links live in each gallery’s `index.json`. That copy step writes the page header and `page.transcriptLinks` into the HTML as real content, and stamps the site chrome from `confs/template-presentations-landingpage/brand.json` (name, icons, share image, wave, colors). A gallery may override that with its own `brand` object. See `confs/template-presentations-landingpage/index.json` for a full example shape. Paths in `brand.json` that start with `/` are site-root paths; the stamp turns icon and share-image URLs into absolute links with `SITE_URL`.

The same step writes `confs/index.html` and `vids/index.html` from `overview.html`. Page copy for those overviews lives in `confs/overview.json` and `vids/overview.json` (copy `template-presentations-landingpage/overview.json` and tailor it). Each card is filled from that gallery’s `index.json` (heading, subtitle, poster, video counts). Do not edit the generated `index.html` files by hand.

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

<a id="yearly-videos"></a>

## Yearly videos (`/vids/<YEAR>/`)

Same gallery app as the conferences, for videos that are not part of a conference. The public path is `/vids/` so WordPress can keep `/videos/`.

```text
vids/
├── .htaccess                       directory listing rewrite (see below)
├── overview.json                   page copy for the /vids/ overview
├── index.html                      generated overview of yearly galleries
├── index.php                       folder browser for bare subdirectories
├── 2024/                           → https://keri.foundation/vids/2024/
│   ├── index.html                  gallery app (synced from the template on build)
│   ├── index.json                  page copy and video list
│   ├── talks/                      *.mp4 + *.mp3 + *.srt side by side
│   └── transcripts/html/talks/     generated static transcript pages
└── 2026/                           → https://keri.foundation/vids/2026/
    ├── index.html
    ├── index.json
    ├── talks/
    └── transcripts/html/talks/
```

The old standalone player redirects here:

`/videos/sam-smith/Its-KERI-or-Surveillance/Its-KERI-or-Surveillance.html` → `/vids/2026/#it-s-keri-or-surveillance-samuel-smith`

`/vids/2026/jul/` redirects to `/vids/2026/` via `vids/.htaccess`.

### New conference

1. Create `confs/<ORG>/<YEAR>/<month>/` and copy `index.json` from `confs/template-presentations-landingpage/` (edit page copy, nav, `transcriptLinks`, videos there).
2. Add media to `talks/` (and `interviews/`, `slides/`, … when present) and fill in `index.json`. `build` writes a podcast `.mp3` next to each `.mp4` when that `.mp3` is not there yet.
3. Run `scripts/deploy-confs.sh landing-pages` (or `build`) so `index.html` is copied from the template and the `/confs/` overview is rewritten.
4. Edit `.srt` files in that conference folder. `scripts/subtitle-sources.tsv` is only for an optional copy from somewhere else.

### Build and deploy

```bash
scripts/deploy-confs.sh landing-pages    # sync gallery index.html, and write /confs/ and /vids/ overviews
scripts/deploy-confs.sh build            # landing-pages → audio → subtitles → transcripts → pdfs → verify
scripts/deploy-confs.sh audio            # podcast MP3 beside each MP4 that does not have one yet
scripts/deploy-confs.sh -n push          # preview what would be uploaded
scripts/deploy-confs.sh deploy           # build + push (rsync --delete) + check the live site
scripts/deploy-confs.sh check-remote     # HEAD-request every referenced file on keri.foundation
scripts/deploy-confs.sh --conf SEDI/2025/nov push
scripts/deploy-confs.sh --conf vids/2026 push
```

`audio` (included in `build` and `deploy`) writes `talks/foo.mp3` from `talks/foo.mp4` when that MP3 is absent. The encode is mono, 44.1 kHz, 64 kbps MP3: about 28 MB per hour, clear enough for a spoken-word podcast. It needs `ffmpeg` with LAME (`brew install ffmpeg`). MP3s are gitignored; `push` uploads them with the gallery. An MP4 that is not on this machine is skipped, and `verify` still reports that file missing.

`push` and `deploy` also upload the site-root `.htaccess` (the `/videos/` redirect), plus the tree indexes: `confs/.htaccess`, `confs/index.php`, `confs/index.html`, and the same three files under `vids/`. A full push mirrors every `confs/<ORG>/` folder and the whole `vids/` tree. `--conf` limits the gallery mirror; the site-root `.htaccess` and both tree indexes are still uploaded.

### Overviews and directory listings (`/confs/`, `/vids/`)

`/confs/` and `/vids/` are static overview pages in the same visual style as a gallery. `landing-pages` (and therefore `build` / `deploy`) writes them from `confs/template-presentations-landingpage/overview.html`. Edit `confs/overview.json` or `vids/overview.json` for the heading, subtitle, nav, and footer. Cards are built from each gallery’s `index.json` and listed newest first.

Hostinger runs **LiteSpeed**, not Apache. LiteSpeed’s built-in autoindex HTML-escapes `HEADER.html` and ignores `AutoIndexUri` in `.htaccess`, so folders that are not a gallery still need a PHP listing.

| File | Role |
| ---- | ---- |
| `overview.json` | Page copy for that tree’s overview. Not uploaded. |
| `index.html` | Generated overview. Do not edit by hand. |
| `.htaccess` | `Options -Indexes`, `DirectoryIndex index.html index.php`, rewrite bare subdirs to `index.php?path=…` |
| `index.php` | Dark-themed folder list for bare subdirectories (dirs first; media/config file types hidden) |

`RewriteBase` must match the public URL of that tree (`/confs/` or `/vids/`). The PHP script derives link prefixes from its location under `DOCUMENT_ROOT`, so the same `index.php` works in either tree—only `.htaccess`’s `RewriteBase` must differ.

Behaviour:

- `/confs/` and `/vids/` serve the generated `index.html` (`DirectoryIndex` prefers it over `index.php`).
- A directory **with** its own `index.html` (a gallery) or its own `index.php` is left alone.
- A bare directory (e.g. `/confs/KERI/`, `/confs/KERI/2026/`) is rewritten to that tree’s `index.php`.
- Entries named in the script’s ignore list are omitted (including `template-presentations-landingpage` under `confs/`).

Do not rely on `HEADER.html` or LiteSpeed `AutoIndexUri` on this host.

### Legacy gallery URLs

Old paths under `/confs/2026/videos/` are redirected with 301 rules in `confs/.htaccess` (not the site-root file, and not separate “moved” HTML pages). LiteSpeed ignores parent rewrite rules once `confs/.htaccess` turns on its own rewrite engine. Examples:

- `/confs/2026/videos/` → `/confs/KERI/2026/apr/`
- `/confs/2026/videos/SEDI/2025-11-SEDI/` → `/confs/SEDI/2025/nov/`

Deep links (talk media, subtitles, transcripts, slides, promo) are mapped the same way. The local `confs/2026/` tree is gone; keep the `.htaccess` rules until those old bookmarks can be retired.

## Subtitles

Curated captions for the conference galleries live in this repository, next to the videos:

```text
confs/KERI/2026/apr/talks/          *.srt
confs/KERI/2026/apr/interviews/     *.srt
confs/SEDI/2025/nov/talks/          morning-|lunch-|afternoon-*.srt
```

Edit those files in place. `scripts/deploy-confs.sh build` regenerates the HTML transcript pages from them. There is no separate subtitles repository.

Stock speech-to-text often mangles KERI terms (“KERI” → “carry”, “KRAM” → “CRAM”, …). Generate drafts with the subtitle machine (not in this repo):

```bash
cd /path/to/KERI-subtitle-machine
./run.sh
# http://127.0.0.1:8765 — drop .mp4 files; captions land in that project’s output/
```

Copy a finished draft into the matching `confs/…` folder and clean it up. Keep the `.srt` name the gallery already references.

[Subtitle Edit](https://subtitleedit.github.io/subtitleedit/) is a fine editor.

Unpublished extras that are not on a gallery live under `confs/_archive/` (not deployed).

### Scripts

Install once with `npm install` inside `scripts/`:

```bash
node scripts/build-transcript-pdf.js KERI/2026/apr
node scripts/remove-rolling-subtitles.js confs/KERI/2026/apr/talks
node scripts/detect-nonsense-subtitles.js confs/KERI/2026/apr/interviews
bash scripts/upload-youtube-subs.sh 'PLAYLIST_URL' confs/KERI/2026/apr/talks
bash scripts/fetch-wordpress.sh  # pull live WordPress (not confs/ or vids/)
python3 scripts/generate_policy_brief_pdf.py
```

`puppeteer-core` (used by the transcript PDF builder) drives your locally installed Chrome; it does not download a browser. YouTube OAuth setup is below.

## Video submission guide

Follow these rules when submitting videos so files stay consistent and easy to find.

Go to [video submission guide](https://github.com/keri-foundation/recordings-and-subtitles/blob/main/VIDEO_SUBMISSION_GUIDE.md)

## YouTube uploader setup

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
bash scripts/upload-youtube-subs.sh 'https://www.youtube.com/playlist?list=YOUR_PLAYLIST_ID' confs/KERI/2026/apr/talks
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
bash scripts/upload-youtube-subs.sh 'https://www.youtube.com/playlist?list=PLxxx' confs/KERI/2026/apr/talks

# One file
bash scripts/upload-youtube-subs.sh 'https://www.youtube.com/playlist?list=PLxxx' confs/KERI/2026/apr/talks --file 'Video Title.srt'

# Force OAuth re-consent
bash scripts/upload-youtube-subs.sh 'https://www.youtube.com/playlist?list=PLxxx' confs/KERI/2026/apr/talks --reauth
```

### How it works

1. Fetches all videos from the YouTube playlist
2. For each video, searches for a matching `.srt` file in the directory you passed
3. Matches by video title
4. Uploads the subtitle file to the video
5. If a subtitle already exists, it updates it

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

**"No matching .srt file"**

- Make sure the video title in the subtitle filename matches the YouTube video title exactly
- Edited subtitle files live next to the videos, for example `confs/KERI/2026/apr/talks/*.srt`

**Authentication issues**

- Delete `.youtube-credentials.json` and try logging in again
- Make sure you granted permission to manage captions

**"Error: invalid_grant"**

- This usually means the saved refresh token was revoked or expired
- The uploader now auto-detects this, removes stale credentials, and prompts login again
- You can force a clean OAuth flow anytime with: `bash scripts/upload-youtube-subs.sh 'https://www.youtube.com/playlist?list=PLAYLIST_ID' confs/KERI/2026/apr/talks --reauth`

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
