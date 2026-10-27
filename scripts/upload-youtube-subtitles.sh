#!/usr/bin/env bash

# Upload fixed subtitles to YouTube videos in a playlist.
# Run from the kerifoundation repo root.
#
#   bash scripts/upload-youtube-subtitles.sh 'https://www.youtube.com/playlist?list=ID' confs/KERI/2026/apr/talks

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLAYLIST_URL="$1"
FIXED_DIR=""
SINGLE_FILE=""
FORCE_UPLOAD="false"
FORCE_REAUTH="false"

shift || true

while [ $# -gt 0 ]; do
  case "$1" in
    --file)
      SINGLE_FILE="$2"
      if [ -z "$SINGLE_FILE" ]; then
        echo "Error: --file requires a subtitle file path or name"
        exit 1
      fi
      shift 2
      ;;
    --force)
      FORCE_UPLOAD="true"
      shift
      ;;
    --reauth)
      FORCE_REAUTH="true"
      shift
      ;;
    *)
      FIXED_DIR="$1"
      shift
      ;;
  esac
done

if [ -z "$PLAYLIST_URL" ] || [ -z "$FIXED_DIR" ]; then
  echo "Usage:"
  echo "  bash scripts/upload-youtube-subtitles.sh PLAYLIST_URL SRT_DIR"
  echo "  bash scripts/upload-youtube-subtitles.sh PLAYLIST_URL SRT_DIR --file 'Video Title.srt'"
  echo "  bash scripts/upload-youtube-subtitles.sh PLAYLIST_URL SRT_DIR --force"
  echo "  bash scripts/upload-youtube-subtitles.sh PLAYLIST_URL SRT_DIR --reauth"
  echo "Example:"
  echo "  bash scripts/upload-youtube-subtitles.sh 'https://www.youtube.com/playlist?list=ID' confs/KERI/2026/apr/talks"
  exit 1
fi

UPLOAD_ARGS=("$PLAYLIST_URL" "$FIXED_DIR")

if [ -n "$SINGLE_FILE" ]; then
  UPLOAD_ARGS+=(--file "$SINGLE_FILE")
fi

if [ "$FORCE_UPLOAD" = "true" ]; then
  UPLOAD_ARGS+=(--force)
fi

if [ "$FORCE_REAUTH" = "true" ]; then
  UPLOAD_ARGS+=(--reauth)
fi

node "$SCRIPT_DIR/upload-youtube-subtitles.js" "${UPLOAD_ARGS[@]}"
