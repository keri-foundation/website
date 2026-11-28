#!/bin/bash
set -euo pipefail

# Build and deploy galleries. /v/ is the entry point for every recorded video:
#   v/confs/<ORG>/<YEAR>/<month>/    conferences (e.g. v/confs/KERI/2026/apr/)
#   v/sessions/<YEAR>/<month>/       other talks and sessions (e.g. v/sessions/2026/jul/)
# The server mirrors those trees. /videos/ is left for WordPress.
#
# Before /v/ these lived at /confs/ and /vids/. Neither directory exists on the
# server any more; every old URL is answered with a 301 from the site-root
# .htaccess, which this script uploads on push. Anything under v/confs/ that is
# not an ORG folder (such as the legacy v/confs/2026/ tree) is never pushed or
# deleted by this script.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SITE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
V="$SITE_ROOT/v"
CONFS="$V/confs"
SESSIONS="$V/sessions"

# SSH host alias (user/host/port live in ~/.ssh/config). Path is relative to that
# account's home so the Hostinger username is not stored in this repository.
REMOTE_HOST="${REMOTE_HOST:-kerifoundation}"
REMOTE_ROOT="${REMOTE_ROOT:-domains/keri.foundation/public_html}"
SITE_URL="${SITE_URL:-https://keri.foundation}"

RSYNC_EXCLUDES=(--exclude .DS_Store --exclude .gitkeep --exclude '._*' --exclude '*.log' --exclude '*.mp3.part')

usage() {
    cat <<'EOF'
Usage: scripts/deploy-confs.sh [options] <command>...

Commands (run in the order given):
  list            Show galleries: v/confs/<ORG>/<YEAR>/<month>/ (as ORG/YEAR/month) and v/sessions/<YEAR>/<month>/ (as sessions/YEAR/month)
  subtitles       Copy curated .srt files from scripts/subtitle-sources.tsv (no-op when that file has no sources; edit SRTs in place under the gallery)
  landing-pages   Copy the shared template into every gallery and stamp social meta, header, transcript links, and optional talk summaries from index.json. Also write v/index.html, v/confs/index.html, and v/sessions/index.html from the overview template
  audio           Write a spoken-word MP3 beside each gallery MP4 when that MP3 does not exist yet
  transcripts     Regenerate the static transcript HTML pages from the .srt files (a sibling .md summary is included when present)
  pdfs            Build concatenated transcript PDFs under each gallery's transcripts/pdf/ (a sibling .md summary opens that talk's chapter when present)
  sitemap         Write v/sitemap.xml (overviews, galleries, transcript HTML)
  verify          Check every file referenced by each index.json exists locally
  unused          List gallery files that nothing on the gallery page references
  verify-videos   Optional gallery MP4 encode checks against VIDEO_SUBMISSION_GUIDE.md (not part of build/deploy; needs ffprobe)
  build           landing-pages + audio + subtitles + transcripts + sitemap + pdfs + verify
  push            Mirror v/confs/<ORG>/ folders and v/sessions/ to the server (rsync --delete), then re-upload every index.html and index.json, plus .htaccess redirects. Refuses to run while the server still has confs/ or vids/
  check-remote    verify + HEAD-request every referenced file on the live site, then check-redirects
  check-redirects Old /confs/ and /vids/ URLs must 301 once to the /v/ URL, which must return 200
  deploy          build + push + check-remote

Options:
  -n, --dry-run   Show what would change; write nothing locally or remotely
  --conf ID       Limit to one gallery, e.g. --conf KERI/2026/apr or --conf sessions/2026/jul (repeatable; the old vids/2026/jul form also works)
  -y, --yes       Do not ask for confirmation before changing the server
  -h, --help      Show this help

Environment overrides: REMOTE_HOST (ssh alias, default kerifoundation),
REMOTE_ROOT (path on that host, default domains/keri.foundation/public_html),
SITE_URL (default https://keri.foundation).

Examples:
  scripts/deploy-confs.sh build                     # local only
  scripts/deploy-confs.sh unused                    # files not referenced by index.json
  scripts/deploy-confs.sh --conf KERI/2026/nov audio # podcast MP3s for one gallery
  scripts/deploy-confs.sh --conf KERI/2026/nov verify-videos
  scripts/deploy-confs.sh -n push                   # preview upload
  scripts/deploy-confs.sh deploy                    # build, upload, check live site
  scripts/deploy-confs.sh --conf SEDI/2025/nov push
  scripts/deploy-confs.sh --conf sessions/2026/jul push
  SITE_URL=http://127.0.0.1:8099 scripts/deploy-confs.sh check-redirects
EOF
}

# Same rules as normalizeGalleryId() in confs.mjs.
normalize_id() {
    local id="${1#/}"
    id="${id%/}"
    id="${id#v/}"
    case "$id" in
        confs/*) id="${id#confs/}" ;;
        vids/*) id="sessions/${id#vids/}" ;;
    esac
    printf '%s\n' "$id"
}

DRY_RUN=0
ASSUME_YES=0
CONF_IDS=()
COMMANDS=()

while [ $# -gt 0 ]; do
    case "$1" in
        -n|--dry-run) DRY_RUN=1 ;;
        -y|--yes) ASSUME_YES=1 ;;
        --conf) shift; CONF_IDS+=("$(normalize_id "$1")") ;;
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

# Local directory for a gallery id (KERI/2026/apr or sessions/2026/jul).
gallery_dir() {
    case "$1" in
        sessions/*) printf '%s\n' "$V/$1" ;;
        *) printf '%s\n' "$CONFS/$1" ;;
    esac
}

# Path under the server web root for a gallery id.
gallery_remote_rel() {
    case "$1" in
        sessions/*) printf '%s\n' "v/$1" ;;
        *) printf '%s\n' "v/confs/$1" ;;
    esac
}

# The galleries were moved by hand on the server (confs/ → v/confs/, vids/ →
# v/sessions/). Pushing before that would upload every MP4 again under v/, and
# the old directories would shadow the site-root redirects.
assert_remote_layout() {
    local leftover
    leftover="$(ssh "$REMOTE_HOST" "cd '$REMOTE_ROOT' && for d in confs vids; do [ -e \"\$d\" ] && echo \"\$d\"; done; true")"
    if [ -n "$leftover" ]; then
        echo "The server still has: $(echo $leftover)  (under $REMOTE_ROOT)" >&2
        echo "Move them into v/ first, then push again:" >&2
        echo "  ssh $REMOTE_HOST \"cd '$REMOTE_ROOT' && mkdir -p v && mv confs v/confs && mv vids v/sessions\"" >&2
        exit 1
    fi
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
# template (social meta, brand chrome, header, and transcript nav links stamped per gallery) — do not edit
# gallery index.html files by hand.
# The same step writes confs/index.html and vids/index.html from overview.html,
# using each tree's overview.json plus the gallery index.json files.
step_landing_pages() {
    echo "── Landing pages (template → galleries)"
    run_node "$SCRIPT_DIR/confs.mjs" landing-pages $(dry_flag)
}

step_audio() {
    echo "── Podcast audio (mp4 → mp3)"
    run_node "$SCRIPT_DIR/confs.mjs" audio $(dry_flag)
}

step_transcripts() {
    echo "── Transcript pages"
    local id
    for id in $(conferences); do
        echo "[$id]"
        node "$SCRIPT_DIR/generate-transcript-pages.mjs" --config "$(gallery_dir "$id")/index.json" $(dry_flag)
    done
}

step_sitemap() {
    echo "── Sitemap (v/sitemap.xml)"
    run_node "$SCRIPT_DIR/confs.mjs" sitemap $(dry_flag)
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

step_unused() {
    echo "── Unused (not reached from gallery page)"
    run_node "$SCRIPT_DIR/confs.mjs" unused
}

step_verify_videos() {
    echo "── Verify gallery MP4 encode"
    run_node "$SCRIPT_DIR/confs.mjs" verify-videos
}

step_push() {
    echo "── Push to $REMOTE_HOST:$REMOTE_ROOT/"
    assert_remote_layout
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
            mirror_remote+=("$REMOTE_ROOT/v/confs/$org/")
        done < <(conferences | awk -F/ '$1 != "sessions" { print $1 }' | sort -u)
        if conferences | grep -q '^sessions/'; then
            mirror_local+=("$SESSIONS/")
            mirror_remote+=("$REMOTE_ROOT/v/sessions/")
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

    echo "── Site redirects (.htaccess), robots.txt, and media sitemap"
    local ht_rsync=(-av --human-readable)
    [ "$DRY_RUN" -eq 1 ] && ht_rsync+=(--dry-run)
    local published
    for published in \
        "$SITE_ROOT/.htaccess" \
        "$SITE_ROOT/robots.txt" \
        "$V/sitemap.xml"
    do
        if [ ! -f "$published" ]; then
            echo "Missing $published — run sitemap (or build) first" >&2
            exit 1
        fi
    done
    [ "$DRY_RUN" -eq 1 ] || ssh "$REMOTE_HOST" "mkdir -p '$REMOTE_ROOT/v/confs' '$REMOTE_ROOT/v/sessions' '$REMOTE_ROOT/v/assets'"
    rsync "${ht_rsync[@]}" "$SITE_ROOT/.htaccess" "$REMOTE_HOST:$REMOTE_ROOT/.htaccess"
    rsync "${ht_rsync[@]}" "$SITE_ROOT/robots.txt" "$REMOTE_HOST:$REMOTE_ROOT/robots.txt"
    rsync "${ht_rsync[@]}" "$V/sitemap.xml" "$REMOTE_HOST:$REMOTE_ROOT/v/sitemap.xml"

    if [ -d "$V/assets" ]; then
        echo "── Shared assets (v/assets/)"
        rsync "${ht_rsync[@]}" --delete "$V/assets/" "$REMOTE_HOST:$REMOTE_ROOT/v/assets/"
    fi

    echo "── Directory indexes (v/, v/confs/, v/sessions/ overview HTML, plus PHP for bare subdirs)"
    local tree_index_rsync=(-av --human-readable)
    [ "$DRY_RUN" -eq 1 ] && tree_index_rsync+=(--dry-run)
    local overview
        for overview in "$V/index.html" "$V/search.json" "$CONFS/index.html" "$SESSIONS/index.html"; do
        if [ ! -f "$overview" ]; then
            echo "Missing $overview — run landing-pages first" >&2
            exit 1
        fi
    done
    rsync "${tree_index_rsync[@]}" \
        "$V/.htaccess" \
        "$V/index.html" \
        "$V/search.json" \
        "$REMOTE_HOST:$REMOTE_ROOT/v/"
    rsync "${tree_index_rsync[@]}" \
        "$CONFS/.htaccess" \
        "$CONFS/index.php" \
        "$CONFS/index.html" \
        "$REMOTE_HOST:$REMOTE_ROOT/v/confs/"
    rsync "${tree_index_rsync[@]}" \
        "$SESSIONS/.htaccess" \
        "$SESSIONS/index.php" \
        "$SESSIONS/index.html" \
        "$REMOTE_HOST:$REMOTE_ROOT/v/sessions/"
    # Drop leftovers: per-tree sitemaps (replaced by v/sitemap.xml; v/sessions/ is
    # mirrored with --delete, v/confs/ is not) and the earlier HEADER.html /
    # AutoIndexUri approach.
    if [ "$DRY_RUN" -eq 0 ]; then
        ssh "$REMOTE_HOST" "rm -f '$REMOTE_ROOT/v/confs/sitemap.xml' '$REMOTE_ROOT/v/confs/HEADER.html' '$REMOTE_ROOT/v/confs/autoindex.php'"
    fi
}

step_check_remote() {
    echo "── Verify ($SITE_URL)"
    run_node "$SCRIPT_DIR/confs.mjs" verify --remote "$SITE_URL"
    step_check_redirects
}

step_check_redirects() {
    echo "── Old /confs/ and /vids/ URLs ($SITE_URL)"
    run_node "$SCRIPT_DIR/confs.mjs" check-redirects --remote "$SITE_URL"
}

for cmd in "${COMMANDS[@]}"; do
    case "$cmd" in
        list) step_list ;;
        subtitles) step_subtitles ;;
        landing-pages) step_landing_pages ;;
        audio) step_audio ;;
        transcripts) step_transcripts ;;
        pdfs) step_pdfs ;;
        sitemap) step_sitemap ;;
        verify) step_verify ;;
        unused) step_unused ;;
        verify-videos) step_verify_videos ;;
        build) step_landing_pages; step_audio; step_subtitles; step_transcripts; step_sitemap; step_pdfs; step_verify ;;
        push) step_push ;;
        check-remote) step_check_remote ;;
        check-redirects) step_check_redirects ;;
        deploy)
            step_landing_pages; step_audio; step_subtitles; step_transcripts; step_sitemap; step_pdfs; step_verify; step_push
            [ "$DRY_RUN" -eq 1 ] || step_check_remote
            ;;
        *) echo "Unknown command: $cmd" >&2; usage >&2; exit 1 ;;
    esac
done
