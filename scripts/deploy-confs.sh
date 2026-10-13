#!/bin/bash
set -euo pipefail

# Build and deploy galleries:
#   confs/<ORG>/<YEAR>/<month>/   conferences (e.g. confs/KERI/2026/apr/)
#   vids/<YEAR>/                  yearly videos (e.g. vids/2026/)
# The server mirrors those trees. /videos/ is left for WordPress.
#
# The legacy tree confs/2026/ is never pushed or deleted by this script. Old gallery
# URLs redirect with rules in confs/.htaccess (and vids/.htaccess), which this
# script uploads on push. Site-root rules do not run under those directories.

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
  list            Show galleries: confs/<ORG>/<YEAR>/<month>/ and vids/<YEAR>/
  subtitles       Copy curated .srt files from scripts/subtitle-sources.tsv (no-op when that file has no sources; edit SRTs in place under the gallery)
  landing-pages   Copy the shared template into every gallery and stamp social meta, header, and transcript links from index.json
  transcripts     Regenerate the static transcript HTML pages from the .srt files
  pdfs            Build concatenated transcript PDFs under each gallery's transcripts/pdf/
  verify          Check every file referenced by each index.json exists locally
  build           landing-pages + subtitles + transcripts + pdfs + verify
  push            Mirror conference folders and vids/ to the server (rsync --delete), then re-upload every index.html and index.json, plus .htaccess redirects
  check-remote    verify + HEAD-request every referenced file on the live site
  deploy          build + push + check-remote
  push-legacy-moved  Upload the "moved" index.html pages for old gallery URLs

Options:
  -n, --dry-run   Show what would change; write nothing locally or remotely
  --conf ID       Limit to one gallery, e.g. --conf KERI/2026/apr or --conf vids/2026 (repeatable)
  -y, --yes       Do not ask for confirmation before changing the server
  -h, --help      Show this help

Environment overrides: REMOTE_HOST (ssh alias, default kerifoundation),
REMOTE_ROOT (server web root), SITE_URL (default https://keri.foundation).

Examples:
  scripts/deploy-confs.sh build                     # local only
  scripts/deploy-confs.sh -n push                   # preview upload
  scripts/deploy-confs.sh deploy                    # build, upload, check live site
  scripts/deploy-confs.sh --conf SEDI/2025/nov push
  scripts/deploy-confs.sh --conf vids/2026 push
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

# Local directory for a gallery id (KERI/2026/apr or vids/2026).
gallery_dir() {
    case "$1" in
        vids/*) printf '%s\n' "$SITE_ROOT/$1" ;;
        *) printf '%s\n' "$CONFS/$1" ;;
    esac
}

# Path under the server web root for a gallery id.
gallery_remote_rel() {
    case "$1" in
        vids/*) printf '%s\n' "$1" ;;
        *) printf '%s\n' "confs/$1" ;;
    esac
}

step_list() {
    conferences
}

step_subtitles() {
    echo "── Subtitles"
    run_node "$SCRIPT_DIR/confs.mjs" sync-subtitles $(dry_flag)
}

# Shared gallery shell: one template, stamped into every conference / vids gallery.
# Page copy stays in each gallery's index.json. index.html is generated from the
# template (social meta, header, and transcript nav links stamped per gallery) — do not edit
# gallery index.html files by hand.
step_landing_pages() {
    echo "── Landing pages (template → galleries)"
    run_node "$SCRIPT_DIR/confs.mjs" landing-pages $(dry_flag)
}

step_transcripts() {
    echo "── Transcript pages"
    local id
    for id in $(conferences); do
        echo "[$id]"
        node "$SCRIPT_DIR/generate-transcript-pages.mjs" --config "$(gallery_dir "$id")/index.json" $(dry_flag)
    done
}

step_pdfs() {
    echo "── Transcript PDFs"
    local id
    for id in $(conferences); do
        echo "[$id]"
        node "$SCRIPT_DIR/build-transcript-pdf.js" "$id" $(dry_flag)
    done
}

step_verify() {
    echo "── Verify (local)"
    run_node "$SCRIPT_DIR/confs.mjs" verify
}

step_push() {
    echo "── Push to $REMOTE_HOST:$REMOTE_ROOT/"
    local -a mirror_local=()
    local -a mirror_remote=()

    if [ ${#CONF_IDS[@]} -gt 0 ]; then
        local id
        for id in "${CONF_IDS[@]}"; do
            mirror_local+=("$(gallery_dir "$id")/")
            mirror_remote+=("$REMOTE_ROOT/$(gallery_remote_rel "$id")/")
        done
    else
        local org
        while IFS= read -r org; do
            [ -n "$org" ] || continue
            mirror_local+=("$CONFS/$org/")
            mirror_remote+=("$REMOTE_ROOT/confs/$org/")
        done < <(conferences | awk -F/ '$1 != "vids" { print $1 }' | sort -u)
        if conferences | grep -q '^vids/'; then
            mirror_local+=("$SITE_ROOT/vids/")
            mirror_remote+=("$REMOTE_ROOT/vids/")
        fi
    fi

    if [ ${#mirror_local[@]} -eq 0 ]; then
        echo "No galleries to upload." >&2
        exit 1
    fi

    echo "Mirroring (rsync --delete):"
    local i
    for i in "${!mirror_local[@]}"; do
        echo "  ${mirror_local[$i]} → ${mirror_remote[$i]}"
    done

    # Every gallery root must have both files. Nested indexes (transcript
    # listings) are included in the re-upload below.
    local id
    for id in $(conferences); do
        local dir
        dir="$(gallery_dir "$id")"
        local f
        for f in index.html index.json; do
            if [ ! -f "$dir/$f" ]; then
                echo "Missing $(gallery_remote_rel "$id")/$f" >&2
                exit 1
            fi
        done
    done
    echo "Re-uploading every index.html and index.json (rsync --ignore-times, same excludes, no --delete):"
    local src rel
    for src in "${mirror_local[@]}"; do
        if [ ! -d "${src%/}" ]; then
            echo "Missing locally: $src" >&2
            exit 1
        fi
        while IFS= read -r rel; do
            [ -n "$rel" ] || continue
            echo "  $rel"
        done < <(cd "$SITE_ROOT" && find "${src#"$SITE_ROOT"/}" -type f \( -name 'index.html' -o -name 'index.json' \) | sort)
    done
    echo "Also uploading .htaccess (redirects)."
    confirm "Upload and mirror these folders to the server?"

    local rsync_opts=(-avz --delete --human-readable "${RSYNC_EXCLUDES[@]}")
    [ "$DRY_RUN" -eq 1 ] && rsync_opts+=(--dry-run)

    for i in "${!mirror_local[@]}"; do
        local src="${mirror_local[$i]}"
        local dest="${mirror_remote[$i]}"
        if [ ! -d "${src%/}" ]; then
            echo "Missing locally: $src" >&2
            exit 1
        fi
        [ "$DRY_RUN" -eq 1 ] || ssh "$REMOTE_HOST" "mkdir -p '${dest%/}'"
        rsync "${rsync_opts[@]}" "$src" "$REMOTE_HOST:$dest"
    done

    # Re-upload every index.html and index.json under each mirrored tree.
    # rsync include rules select those names at any depth. --ignore-times
    # forces the transfer even when size and mtime already match. This pass
    # does not use --delete: that would remove every file the filters skip.
    echo "── index.html / index.json"
    local index_rsync=(
        -avz --ignore-times --human-readable --prune-empty-dirs
        "${RSYNC_EXCLUDES[@]}"
        --include='*/'
        --include='index.html'
        --include='index.json'
        --exclude='*'
    )
    [ "$DRY_RUN" -eq 1 ] && index_rsync+=(--dry-run)
    for i in "${!mirror_local[@]}"; do
        rsync "${index_rsync[@]}" "${mirror_local[$i]}" "$REMOTE_HOST:${mirror_remote[$i]}"
    done

    echo "── Site redirects (.htaccess)"
    local ht_rsync=(-av --human-readable)
    [ "$DRY_RUN" -eq 1 ] && ht_rsync+=(--dry-run)
    rsync "${ht_rsync[@]}" "$SITE_ROOT/.htaccess" "$REMOTE_HOST:$REMOTE_ROOT/.htaccess"

    echo "── confs/ directory index (.htaccess, index.php)"
    local confs_index_rsync=(-av --human-readable)
    [ "$DRY_RUN" -eq 1 ] && confs_index_rsync+=(--dry-run)
    [ "$DRY_RUN" -eq 1 ] || ssh "$REMOTE_HOST" "mkdir -p '$REMOTE_ROOT/confs'"
    rsync "${confs_index_rsync[@]}" \
        "$CONFS/.htaccess" \
        "$CONFS/index.php" \
        "$REMOTE_HOST:$REMOTE_ROOT/confs/"
    # Drop leftovers from the earlier HEADER.html / AutoIndexUri approach.
    if [ "$DRY_RUN" -eq 0 ]; then
        ssh "$REMOTE_HOST" "rm -f '$REMOTE_ROOT/confs/HEADER.html' '$REMOTE_ROOT/confs/autoindex.php'"
    fi
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
        landing-pages) step_landing_pages ;;
        transcripts) step_transcripts ;;
        pdfs) step_pdfs ;;
        verify) step_verify ;;
        build) step_landing_pages; step_subtitles; step_transcripts; step_pdfs; step_verify ;;
        push) step_push ;;
        check-remote) step_check_remote ;;
        deploy)
            step_landing_pages; step_subtitles; step_transcripts; step_pdfs; step_verify; step_push
            [ "$DRY_RUN" -eq 1 ] || step_check_remote
            ;;
        push-legacy-moved) step_push_legacy_moved ;;
        *) echo "Unknown command: $cmd" >&2; usage >&2; exit 1 ;;
    esac
done
