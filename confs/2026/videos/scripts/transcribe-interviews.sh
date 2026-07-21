#!/usr/bin/env bash
# Batch-transcribe KERICONF26 interview videos with Whisper CTranslate2 (large-v3),
# using vocabulary mined from curated KERICONF26 presentation subtitles.
#
# Prerequisites:
#   - Subtitle Edit installed (uses its bundled whisper-ctranslate2 binary)
#   - Run build-whisper-vocabulary.py first
#
# Usage:
#   ./transcribe-interviews.sh              # all interviews
#   ./transcribe-interviews.sh Ari-Argoud-Interview   # one interview (basename, no .mp4)
#   ./transcribe-interviews.sh --dry-run

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VIDEOS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
INTERVIEWS_DIR="$VIDEOS_DIR/KERICONF26-interviews"
OUTPUT_DIR="$INTERVIEWS_DIR/subtitles"
CONFIG_DIR="$INTERVIEWS_DIR/whisper-config"
CONFIG_JSON="$CONFIG_DIR/interview-configs.json"
LOOKUP_PY="$SCRIPT_DIR/whisper-config-lookup.py"

WHISPER_BIN="${WHISPER_BIN:-$HOME/Library/Application Support/Subtitle Edit/SpeechToText/CTranslate2/whisper-ctranslate2}"
MODEL="${WHISPER_MODEL:-large-v3}"
LANGUAGE="${WHISPER_LANGUAGE:-en}"

DRY_RUN=0
REQUESTED=()

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    *) REQUESTED+=("$arg") ;;
  esac
done

if [[ ! -x "$WHISPER_BIN" ]]; then
  echo "whisper-ctranslate2 not found at: $WHISPER_BIN" >&2
  echo "Install Subtitle Edit and download the CTranslate2 engine, or set WHISPER_BIN." >&2
  exit 1
fi

if [[ ! -f "$CONFIG_JSON" ]]; then
  echo "Missing $CONFIG_JSON — run: python3 $SCRIPT_DIR/build-whisper-vocabulary.py" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

lookup_config() {
  python3 "$LOOKUP_PY" "$CONFIG_JSON" "$1"
}

transcribe_one() {
  local stem="$1"
  local video="$INTERVIEWS_DIR/$stem.mp4"
  local out_srt="$OUTPUT_DIR/$stem.srt"

  if [[ ! -f "$video" ]]; then
    echo "Skip (no video): $video" >&2
    return 0
  fi

  if [[ -f "$out_srt" ]]; then
    echo "Skip (already exists): $out_srt"
    return 0
  fi

  local hotwords prompt
  IFS=$'\t' read -r hotwords prompt < <(lookup_config "$stem")

  echo "Transcribing: $stem"
  echo "  video: $video"
  echo "  output: $out_srt"

  local cmd=(
    "$WHISPER_BIN"
    "$video"
    --model "$MODEL"
    --language "$LANGUAGE"
    --output_dir "$OUTPUT_DIR"
    --output_format srt
    --vad_filter True
    --hotwords "$hotwords"
    --initial_prompt "$prompt"
  )

  if [[ $DRY_RUN -eq 1 ]]; then
    printf '  dry-run:'
    printf ' %q' "${cmd[@]}"
    echo
    return 0
  fi

  "${cmd[@]}"

  if [[ -f "$out_srt" ]]; then
    echo "  done: $out_srt"
  else
    echo "  warning: expected output not found: $out_srt" >&2
  fi
}

if [[ ${#REQUESTED[@]} -gt 0 ]]; then
  for stem in "${REQUESTED[@]}"; do
    transcribe_one "$stem"
  done
else
  for video in "$INTERVIEWS_DIR"/*.mp4; do
    [[ -f "$video" ]] || continue
    stem="$(basename "$video" .mp4)"
    transcribe_one "$stem"
  done
fi

echo "Finished. Draft SRT files are in: $OUTPUT_DIR"
echo "After manual curation, save as *.fixed.srt for the video index."
