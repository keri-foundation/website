# Video submission guide

Follow these rules when submitting videos so files stay consistent and easy to find.

## Naming Conventions

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

- spaces ( ` ` )
- pipe symbols (`|`)
- slashes (`/`)
- back-slashes (`\`)
- periods (`.`)

If you include a date in the file name, put it first and use ISO format (`YYYY-MM-DD`), for example: `2026-07-23-john-doe-interview`.

## File Location

Once a video is released (for example via Google Drive), keep its path and file name unchanged. New versions must replace the existing file at the same location rather than introducing a new name or path.

## Content Freeze

After delivery, do not edit the video’s length or content. Any change—cuts, inserts, reordering, or re-exports with different timing—breaks subtitle sync and forces a full rework of the caption files.

Cosmetic changes that do not affect timing—such as volume, color grading, or brightness—are fine.

## Video Quality

The video files are intended for the web. The video files you submit must meet the following requirements.

### Core Format (Maximum Compatibility)

- **Container**: MP4 (MPEG-4 Part 14)
- **Video Codec**: H.264 (AVC) — best universal support across all browsers and devices
- **Audio Codec**: AAC (Advanced Audio Coding), stereo, 128–192 kbps
- **Profile**: High Profile, Level 4.1 or 4.2 (safe for 1080p)

This combination plays natively in Chrome, Firefox, Safari, Edge, iOS, Android, etc., with no plugins.

### Resolution & Bitrate Recommendations (Conference Recordings)

Conference videos (talking head + slides) compress very well. Aim for these targets:


| Resolution      | Target Bitrate (Video) | Approx. File Size (1 hour) |
| --------------- | ---------------------- | -------------------------- |
| 720p (1280×720) | 1,500 – 2,500 kbps     | 700 MB – 1.1 GB            |


Deliver **720p at ~2,000 kbps** video bitrate. This usually keeps a 1-hour conference talk under **900–950 MB** while looking sharp on laptops and large screens. Most viewers will not notice a big difference from 1080p on typical conference content.

### Other Important Settings

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

