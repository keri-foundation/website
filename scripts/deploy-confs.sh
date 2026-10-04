#!/bin/bash
set -euo pipefail

# Build and deploy the conference galleries under confs/<ORG>/<YEAR>/<month>/
# (e.g. confs/KERI/2026/apr/, confs/SEDI/2025/nov/). The server mirrors the local tree.
#
# The legacy tree confs/2026/ is never pushed or deleted by this script. Old gallery
# entry URLs use simple "moved" index.html pages (not .htaccess redirects).

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SITE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFS="$SITE_ROOT/confs"

REMOTE_HOST="${REMOTE_HOST:-kerifoundation}"
REMOTE_ROOT="${REMOTE_ROOT:-/home/REDACTED/domains/keri.foundation/public_html}"
SITE_URL="${SITE_URL:-https://keri.foundation}"

# Legacy gallery entry pages (plain HTML "moved" notices → new conference paths).
LEGACY_MOVED_PAGES=(
    "confs/2026/videos/index.html"
    "confs/2026/videos/SEDI/2025-11-SEDI/index.html"
)

RSYNC_EXCLUDES=(--exclude .DS_Store --exclude .gitkeep --exclude '._*' --exclude '*.log')

usage() {
    cat <<'EOF'
Usage: scripts/deploy-confs.sh [options] <command>...

Commands (run in the order given):
  list            Show the conferences found under confs/<ORG>/<YEAR>/<month>/
  subtitles       Copy curated .srt files from scripts/subtitle-sources.tsv (no-op when that file has no sources; edit SRTs in place under confs/)
  transcripts     Regenerate the static transcript HTML pages from the .srt files
  verify          Check every file referenced by each index.json exists locally
  build           subtitles + transcripts + verify
  push            Mirror the conference folders to the server (rsync --delete)
  check-remote    verify + HEAD-request every referenced file on the live site
  deploy          build + push + check-remote
  push-legacy-moved  Upload the "moved" index.html pages for old gallery URLs

Options:
  -n, --dry-run   Show what would change; write nothing locally or remotely
  --conf ID       Limit to one conference, e.g. --conf KERI/2026/apr (repeatable)
  -y, --yes       Do not ask for confirmation before changing the server
  -h, --help      Show this help

Environment overrides: REMOTE_HOST (ssh alias, default kerifoundation),
REMOTE_ROOT (server web root), SITE_URL (default https://keri.foundation).

Examples:
  scripts/deploy-confs.sh build                     # local only
  scripts/deploy-confs.sh -n push                   # preview upload
  scripts/deploy-confs.sh deploy                    # build, upload, check live site
  scripts/deploy-confs.sh --conf SEDI/2025/nov push
EOF
}

DRY_RUN=0
ASSUME_YES=0
CONF_IDS=()
COMMANDS=()

while [ $# -gt 0 ]; do
    case "$1" in
        -n|--dry-run) DRY_RUN=1 ;;
        -y|--yes) ASSUME_YES=1 ;;
        --conf) shift; CONF_IDS+=("${1%/}") ;;
        -h|--help) usage; exit 0 ;;
        -*) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
        *) COMMANDS+=("$1") ;;
    esac
    shift
done

if [ ${#COMMANDS[@]} -eq 0 ]; then
    usage
    exit 1
fi

# bash 3.2 (macOS) treats "${empty[@]}" as unbound under set -u; expand safely.
conf_args() {
    local id
    for id in ${CONF_IDS[@]+"${CONF_IDS[@]}"}; do
        printf '%s\n' --conf "$id"
    done
}

run_node() {
    local args=()
    local line
    while IFS= read -r line; do args+=("$line"); done < <(conf_args)
    node "$@" ${args[@]+"${args[@]}"}
}

dry_flag() {
    [ "$DRY_RUN" -eq 1 ] && echo "--dry-run" || true
}

confirm() {
    [ "$DRY_RUN" -eq 1 ] && return 0
    [ "$ASSUME_YES" -eq 1 ] && return 0
    local reply
    read -r -p "$1 [y/N] " reply
    case "$reply" in
        y|Y|yes|YES) return 0 ;;
        *) echo "Aborted."; exit 1 ;;
    esac
}

conferences() {
    run_node "$SCRIPT_DIR/confs.mjs" list
}

# What to mirror: the requested conference folders, or every <ORG>/ folder.
push_targets() {
    if [ ${#CONF_IDS[@]} -gt 0 ]; then
        printf '%s\n' "${CONF_IDS[@]}"
    else
        conferences | cut -d/ -f1 | sort -u
    fi
}

step_list() {
    conferences
}

step_subtitles() {
    echo "── Subtitles"
    run_node "$SCRIPT_DIR/confs.mjs" sync-subtitles $(dry_flag)
}

step_transcripts() {
    echo "── Transcript pages"
    local id
    for id in $(conferences); do
        echo "[$id]"
        node "$SCRIPT_DIR/generate-transcript-pages.mjs" --config "$CONFS/$id/index.json" $(dry_flag)
    done
}

step_verify() {
    echo "── Verify (local)"
    run_node "$SCRIPT_DIR/confs.mjs" verify
}

step_push() {
    echo "── Push to $REMOTE_HOST:$REMOTE_ROOT/confs/"
    local targets=()
    local t
    while IFS= read -r t; do targets+=("$t"); done < <(push_targets)
    echo "Mirroring (rsync --delete): ${targets[*]}"
    confirm "Upload and mirror these folders to the server?"

    local rsync_opts=(-avz --delete --human-readable "${RSYNC_EXCLUDES[@]}")
    [ "$DRY_RUN" -eq 1 ] && rsync_opts+=(--dry-run)

    for t in "${targets[@]}"; do
        if [ ! -d "$CONFS/$t" ]; then
            echo "Missing locally: confs/$t" >&2
            exit 1
        fi
        [ "$DRY_RUN" -eq 1 ] || ssh "$REMOTE_HOST" "mkdir -p '$REMOTE_ROOT/confs/$t'"
        rsync "${rsync_opts[@]}" "$CONFS/$t/" "$REMOTE_HOST:$REMOTE_ROOT/confs/$t/"
    done
}

step_check_remote() {
    echo "── Verify ($SITE_URL)"
    run_node "$SCRIPT_DIR/confs.mjs" verify --remote "$SITE_URL"
}

step_push_legacy_moved() {
    echo "── Legacy moved pages → $REMOTE_HOST"
    local rel
    for rel in "${LEGACY_MOVED_PAGES[@]}"; do
        if [ ! -f "$SITE_ROOT/$rel" ]; then
            echo "Missing $rel" >&2
            exit 1
        fi
    done
    confirm "Upload moved-gallery index.html pages to the legacy URLs?"
    if [ "$DRY_RUN" -eq 1 ]; then
        printf '[dry-run] would upload: %s\n' "${LEGACY_MOVED_PAGES[@]}"
        return
    fi
    for rel in "${LEGACY_MOVED_PAGES[@]}"; do
        ssh "$REMOTE_HOST" "mkdir -p '$REMOTE_ROOT/$(dirname "$rel")'"
        rsync -av "$SITE_ROOT/$rel" "$REMOTE_HOST:$REMOTE_ROOT/$rel"
        # Ensure no leftover DirectoryIndex / PHP stubs shadow the HTML page.
        ssh "$REMOTE_HOST" "rm -f '$REMOTE_ROOT/$(dirname "$rel")/.htaccess' \
            '$REMOTE_ROOT/$(dirname "$rel")/index.php' \
            '$REMOTE_ROOT/$(dirname "$rel")/redirect-target.php'" || true
    done
    echo "Live:"
    echo "  $SITE_URL/confs/2026/videos/"
    echo "  $SITE_URL/confs/2026/videos/SEDI/2025-11-SEDI/"
}

for cmd in "${COMMANDS[@]}"; do
    case "$cmd" in
        list) step_list ;;
        subtitles) step_subtitles ;;
        transcripts) step_transcripts ;;
        verify) step_verify ;;
        build) step_subtitles; step_transcripts; step_verify ;;
        push) step_push ;;
        check-remote) step_check_remote ;;
        deploy)
            step_subtitles; step_transcripts; step_verify; step_push
            [ "$DRY_RUN" -eq 1 ] || step_check_remote
            ;;
        push-legacy-moved) step_push_legacy_moved ;;
        *) echo "Unknown command: $cmd" >&2; usage >&2; exit 1 ;;
    esac
done
