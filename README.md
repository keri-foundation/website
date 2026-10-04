# General information

This repo contains information about and backups of [https://keri.foundation](https://keri.foundation).

The repository does not include the full WordPress core files. It includes the site database export backup in ZIP format, password-protected.

## Managing the website

Go to [https://hpanel.hostinger.com/websites/keri.foundation](https://hpanel.hostinger.com/websites/keri.foundation)

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
└── template-presentations-landingpage/   generic starting point for a new conference
```

`index.json` → `transcriptsDir` (`transcripts/html`) tells both the gallery and the generator where HTML transcript pages live, for example `transcripts/html/talks/<video-id>.html`. Concatenated PDFs go under `transcripts/pdf/talks/`.

### New conference

1. Create `confs/<ORG>/<YEAR>/<month>/` and copy `index.html` + `index.json` from `confs/template-presentations-landingpage/`.
2. Add media to `talks/` (and `interviews/`, `slides/`, … when present) and fill in `index.json`.
3. Adjust the static transcript links (`<nav class="seo-transcript-links">`) in `index.html`.
4. Edit `.srt` files in that conference folder. `scripts/subtitle-sources.tsv` is only for an optional copy from somewhere else.

### Build and deploy

```bash
scripts/deploy-confs.sh build            # subtitles → transcript pages → verify (local only)
scripts/deploy-confs.sh -n push          # preview what would be uploaded
scripts/deploy-confs.sh deploy           # build + push (rsync --delete) + check the live site
scripts/deploy-confs.sh check-remote     # HEAD-request every referenced file on keri.foundation
scripts/deploy-confs.sh --conf SEDI/2025/nov push
```

### Legacy gallery URLs

Old paths under `/confs/2026/videos/` are redirected with 301 rules in `.htaccess` (not separate “moved” HTML pages). Examples:

- `/confs/2026/videos/` → `/confs/KERI/2026/apr/`
- `/confs/2026/videos/SEDI/2025-11-SEDI/` → `/confs/SEDI/2025/nov/`

Deep links (talk media, subtitles, transcripts, slides, promo) are mapped the same way. The local `confs/2026/` tree is gone; keep the `.htaccess` rules until those old bookmarks can be retired.

## Subtitles

Curated captions for the conference galleries live in this repository, next to the videos:

```text
confs/KERI/2026/apr/talks/          *.fixed.srt
confs/KERI/2026/apr/interviews/     *.srt
confs/SEDI/2025/nov/talks/          morning-|lunch-|afternoon-*.srt
```

Edit those files in place. `scripts/deploy-confs.sh build` regenerates the HTML transcript pages from them. There is no separate subtitles repository.

Stock speech-to-text often mangles KERI terms (“KERI” → “carry”, “KRAM” → “CRAM”, …). Generate drafts with the subtitle machine (not in this repo):

```bash
cd /Users/kor/webdev/Blockchain-Bird/KERI/KERI-subtitle-machine
./run.sh
# http://127.0.0.1:8765 — drop .mp4 files; captions land in that project’s output/
```

Copy a finished draft into the matching `confs/…` folder, clean it up, and for KERI talks keep the `*.fixed.srt` name the gallery already references.

[Subtitle Edit](https://subtitleedit.github.io/subtitleedit/) is a fine editor.

Unpublished extras that are not on a gallery live under `confs/_archive/` (not deployed).

### Scripts

Install once with `npm install` inside `scripts/`:

```bash
node scripts/build-transcript-pdf.js KERI/2026/apr
node scripts/remove-rolling-subtitles.js confs/KERI/2026/apr/talks
bash scripts/upload-youtube-subs.sh 'PLAYLIST_URL' confs/KERI/2026/apr/talks
bash scripts/fetch.sh          # pull the live site into this checkout
python3 scripts/generate_policy_brief_pdf.py
```

`puppeteer-core` (used by the transcript PDF builder) drives your locally installed Chrome; it does not download a browser. YouTube OAuth setup is below.

## Video submission guide

Follow these rules when submitting videos so files stay consistent and easy to find.

### Naming conventions

Discuss the naming convention with your team before starting. Decide on a format. Use that format for every file.

Example pattern: `firstname-lastname-interview`

Incorrect (inconsistent suffixes):

- `john-doe-interview`
- `john-smith`
- `joe-bloggs-interview`

Correct (same suffix on every file):

- `john-doe-interview`
- `john-smith-interview`
- `joe-bloggs-interview`

Do not use the following characters in file names:

- spaces (` `)
- pipe symbols (`|`)
- slashes (`/`)
- back-slashes (`\`)
- periods (`.`)

If you include a date in the file name, put it first and use ISO format (`YYYY-MM-DD`), for example: `2026-07-23-john-doe-interview`.

### File location

Once a video is released (for example via Google Drive), keep its path and file name unchanged. New versions must replace the existing file at the same location rather than introducing a new name or path.

### Content freeze

After delivery, do not edit the video’s length or content. Any change—cuts, inserts, reordering, or re-exports with different timing—breaks subtitle sync and forces a full rework of the caption files.

Cosmetic changes that do not affect timing—such as volume, color grading, or brightness—are fine.

### Video quality

The video files are intended for the web. The video files you submit must meet the following requirements.

#### Core format (maximum compatibility)

- **Container**: MP4 (MPEG-4 Part 14)
- **Video Codec**: H.264 (AVC) — best universal support across all browsers and devices
- **Audio Codec**: AAC (Advanced Audio Coding), stereo, 128–192 kbps
- **Profile**: High Profile, Level 4.1 or 4.2 (safe for 1080p)

This combination plays natively in Chrome, Firefox, Safari, Edge, iOS, Android, etc., with no plugins.

#### Resolution & bitrate recommendations (conference recordings)

Conference videos (talking head + slides) compress very well. Aim for these targets:

| Resolution      | Target Bitrate (Video) | Approx. File Size (1 hour) |
| --------------- | ---------------------- | -------------------------- |
| 720p (1280×720) | 1,500 – 2,500 kbps     | 700 MB – 1.1 GB            |

Deliver **720p at ~2,000 kbps** video bitrate. This usually keeps a 1-hour conference talk under **900–950 MB** while looking sharp on laptops and large screens. Most viewers will not notice a big difference from 1080p on typical conference content.

#### Other important settings

- **Frame Rate**: Keep original (usually 25 or 30 fps). Do not convert unless necessary.
- **Keyframe Interval**: Every 2–3 seconds (or automatic).
- **Aspect Ratio**: 16:9 (most common). Use 4:3 only if the original recording is 4:3.
- **Audio**: 128 kbps AAC stereo is plenty. Conference audio is mostly speech — no need for high bitrates.
- **Maximum file size goal**:
  - < 1 GB per hour is excellent.
  - < 700–800 MB per hour is ideal for good user experience.
- **Encoding Settings**:
  - Two-pass encoding (better quality at same file size).
  - CRF 19–23 (if using x264) for high quality.
  - Use **fast** or **medium** preset — avoid "placebo" or "veryslow" unless you have time.

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
bash scripts/upload-youtube-subs.sh 'https://www.youtube.com/playlist?list=PLxxx' confs/KERI/2026/apr/talks --file 'Video Title.fixed.srt'

# Force OAuth re-consent
bash scripts/upload-youtube-subs.sh 'https://www.youtube.com/playlist?list=PLxxx' confs/KERI/2026/apr/talks --reauth
```

### How it works

1. Fetches all videos from the YouTube playlist
2. For each video, searches for a matching `.fixed.srt` (or `.srt`) file in the directory you passed
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

**"No matching .fixed.srt file"**

- Make sure the video title in the subtitle filename matches the YouTube video title exactly
- Edited subtitle files live next to the videos, for example `confs/KERI/2026/apr/talks/*.fixed.srt`

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
