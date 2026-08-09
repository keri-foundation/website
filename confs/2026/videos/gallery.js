/**
 * Shared video gallery app. Content comes from site.json next to index.html.
 * Override config path with: window.GALLERY_CONFIG = 'my-site.json';
 */
(function () {
'use strict';

let videos = [];
let defaultPoster = '';
let dayOrder = [];
let topClips = [];
let promoVideoEl = null;

function resolveAssetUrl(path) {
    if (!path) return path;
    if (/^(https?:)?\/\//i.test(path) || path.startsWith('/')) return path;
    return new URL(path, window.location.href).href;
}

const plyrConfig = {
    seekTime: 10,
    controls: ['play-large', 'rewind', 'play', 'fast-forward', 'progress', 'current-time', 'duration', 'mute', 'volume', 'captions', 'settings', 'fullscreen'],
    settings: ['speed'],
    speed: {
        selected: 1,
        options: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
    },
    iconUrl: 'https://cdn.plyr.io/3.8.4/plyr.svg',
    loadSprite: true,
    hideControls: true,
    clickToPlay: true,
    captions: {
        active: true,
        update: true,
        language: 'en'
    },
    storage: {
        enabled: false
    }
};

const OVERLAY_CONTROLS_HOLD_MS = 2500;

function createOverlaySeekButton(label, title, pathD, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'plyr__control plyr__control--overlay-seek';
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', title);
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
    });

    const namespace = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(namespace, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('viewBox', '0 0 24 24');

    const path = document.createElementNS(namespace, 'path');
    path.setAttribute('d', pathD);
    path.setAttribute('fill', 'currentColor');
    svg.appendChild(path);
    btn.appendChild(svg);
    return btn;
}

function pinOverlayControls(player, holdMs = OVERLAY_CONTROLS_HOLD_MS) {
    const container = player?.elements?.container;
    if (!container) return;

    if (typeof player.toggleControls === 'function') {
        player.toggleControls(true);
    }

    container.classList.add('plyr--overlay-controls-pinned');
    clearTimeout(container._overlayControlsPinTimer);
    container._overlayControlsPinTimer = setTimeout(() => {
        container.classList.remove('plyr--overlay-controls-pinned');
        container._overlayControlsPinTimer = null;
    }, holdMs);
}

function enhanceOverlaidPlayToggle(player, iconUrl) {
    if (!player?.elements?.container) return;

    const overlaid = player.elements.container.querySelector('.plyr__control--overlaid');
    if (!overlaid) return;

    const playIcon = overlaid.querySelector('svg');
    if (playIcon && !overlaid.querySelector('.icon--pressed')) {
        playIcon.classList.add('icon--not-pressed');

        const namespace = 'http://www.w3.org/2000/svg';
        const pauseIcon = document.createElementNS(namespace, 'svg');
        pauseIcon.setAttribute('aria-hidden', 'true');
        pauseIcon.setAttribute('focusable', 'false');
        pauseIcon.setAttribute('viewBox', '0 0 24 24');
        pauseIcon.classList.add('icon--pressed');

        const pausePath = document.createElementNS(namespace, 'path');
        pausePath.setAttribute('d', 'M6 4h4v16H6zM14 4h4v16h-4z');
        pausePath.setAttribute('fill', 'currentColor');
        pauseIcon.appendChild(pausePath);

        playIcon.before(pauseIcon);
    }

    if (player.elements.container.querySelector('.plyr__overlay-controls')) return;

    const seekTime = typeof player.config?.seekTime === 'number' ? player.config.seekTime : 10;
    const cluster = document.createElement('div');
    cluster.className = 'plyr__overlay-controls';

    const rewindBtn = createOverlaySeekButton(
        `Go back ${seekTime} seconds`,
        `Go back ${seekTime} seconds`,
        'M11.5 12l8.5 6V6l-8.5 6zm-9 0l8.5 6V6L2.5 12z',
        () => {
            if (typeof player.rewind === 'function') player.rewind(seekTime);
            else player.currentTime = Math.max(0, (player.currentTime || 0) - seekTime);
            pinOverlayControls(player);
        }
    );

    const forwardBtn = createOverlaySeekButton(
        `Go forward ${seekTime} seconds`,
        `Go forward ${seekTime} seconds`,
        'M12.5 12l-8.5 6V6l8.5 6zm9 0l-8.5 6V6l8.5 6z',
        () => {
            if (typeof player.forward === 'function') player.forward(seekTime);
            else {
                const duration = player.duration || 0;
                player.currentTime = Math.min(duration, (player.currentTime || 0) + seekTime);
            }
            pinOverlayControls(player);
        }
    );

    overlaid.replaceWith(cluster);
    cluster.appendChild(rewindBtn);
    cluster.appendChild(overlaid);
    cluster.appendChild(forwardBtn);
}

function attachFilteredPoster(videoEl) {
    const posterUrl = videoEl.poster;
    if (!posterUrl) return;

    const wrapper = videoEl.closest('.plyr__video-wrapper');
    if (!wrapper || wrapper.querySelector('.video-poster-filter-wrap')) return;

    const wrap = document.createElement('div');
    wrap.className = 'video-poster-filter-wrap';
    wrap.setAttribute('aria-hidden', 'true');

    const img = document.createElement('img');
    img.className = 'video-poster-filter';
    img.src = posterUrl;
    img.alt = '';
    img.decoding = 'async';

    wrap.appendChild(img);
    wrapper.appendChild(wrap);
}

function initPlyrVideo(videoEl, options = {}) {
    if (!videoEl || !window.Plyr || videoEl.dataset.plyrInitialized === 'true') return null;
    if (!videoEl.isConnected) {
        if (videoEl.dataset.plyrInitPending !== 'true') {
            videoEl.dataset.plyrInitPending = 'true';
            requestAnimationFrame(() => {
                videoEl.dataset.plyrInitPending = 'false';
                initPlyrVideo(videoEl, options);
            });
        }
        return null;
    }
    const player = new window.Plyr(videoEl, plyrConfig);
    videoEl.dataset.plyrInitialized = 'true';
    videoEl._plyrPlayer = player;
    enhanceOverlaidPlayToggle(player, plyrConfig.iconUrl);
    if (options.filteredPoster !== false) {
        attachFilteredPoster(videoEl);
    }
    return player;
}

function syncPlyrCaptions(videoEl) {
    const player = videoEl && videoEl._plyrPlayer ? videoEl._plyrPlayer : null;
    if (!player || !player.media) return;

    const media = player.media;
    const tracks = Array.from(media.textTracks).filter(track => track.kind === 'subtitles' || track.kind === 'captions');
    if (!tracks.length) return;

    const preferred = tracks.find(track => track.language === 'en') ?? tracks[0];
    if (!preferred) return;

    const apply = () => {
        try {
            player.language = preferred.language || 'en';
            player.toggleCaptions(true);
        } catch {
            // Plyr may not be ready yet; ignore.
        }
    };

    apply();
    if (!preferred.cues?.length) {
        preferred.addEventListener('load', apply, { once: true });
    }
}

let speakerPhotos = {};

function getSpeakerPoster(video) {
    const filename = (video.path.split('/').pop() || '').replace(/\.mp4$/i, '');
    let speaker = filename.split('｜')[0].trim()
        .replace(/\s+Pannel$/i, '')
        .replace(/\s+Panel$/i, '');
    // Interview files use "First-Last-Interview.mp4" (no ｜ separators)
    if (!filename.includes('｜') && speaker.includes('-')) {
        speaker = speaker.replace(/-Interview$/i, '').replace(/-/g, ' ');
    }
    if (speakerPhotos[speaker]) return speakerPhotos[speaker];
    const firstSpeaker = speaker.match(/^([A-Za-z]+ [A-Za-z]+)/);
    if (firstSpeaker && speakerPhotos[firstSpeaker[1]]) return speakerPhotos[firstSpeaker[1]];
    return defaultPoster;
}

// ─────────────────────────────────────────────────────────────────────
//  Utilities
// ─────────────────────────────────────────────────────────────────────
function srtTimeToSeconds(hms, ms) {
    const [h, m, s] = hms.split(':').map(Number);
    return h * 3600 + m * 60 + s + Number(ms) / 1000;
}

function formatTime(totalSec) {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = Math.floor(totalSec % 60);
    return h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${m}:${String(s).padStart(2, '0')}`;
}

function escHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}


const YOUTUBE_ICON = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Ik0xMiA4djggbC00LTIuNXYtMy4yTDggMTJ6Ii8+PC9zdmc+';

function renderPageChrome(page, topClipsConfig) {
    if (!page) return;

    if (page.title) document.title = page.title;

    const header = document.getElementById('galleryHeader');
    if (header) {
        const heading = page.heading || page.title || '';
        const href = page.headingHref || './';
        let html = `<h1><a href="${escHtml(href)}">${escHtml(heading)}</a></h1>`;
        if (page.statusNotice) {
            html += `<div class="status-notice" aria-live="polite">${escHtml(page.statusNotice)}</div>`;
        }
        if (page.subtitle) {
            html += `<p class="subtitle">${escHtml(page.subtitle)}</p>`;
        }
        const nav = page.nav || [];
        if (nav.length) {
            const parts = [];
            nav.forEach((item, i) => {
                const prev = nav[i - 1];
                const target = item.external === false ? '' : ' target="_blank" rel="noopener noreferrer"';
                let label = escHtml(item.label || '');
                if (item.icon === 'youtube') {
                    label = `<img src="${YOUTUBE_ICON}" alt="YouTube" width="24" height="24" style="vertical-align: middle; margin-right: 5px;">${label}`;
                }
                const prefix = item.prefix ? `${escHtml(item.prefix)} ` : '';
                const link = `${prefix}<a href="${escHtml(item.href)}"${target}>${label}</a>`;
                if (i === 0) {
                    parts.push(link);
                } else if (item.prefix) {
                    parts.push(' | ' + link);
                } else if (prev && prev.icon === 'youtube' && item.icon === 'youtube') {
                    parts.push(' ' + link);
                } else {
                    parts.push(' | ' + link);
                }
            });
            html += parts.join('');
        }
        header.innerHTML = html;
    }

    const footer = document.getElementById('galleryFooter');
    if (footer && page.footer) {
        footer.innerHTML = `<p>${escHtml(page.footer)}</p>`;
    }

    const searchLabel = document.getElementById('searchLabel');
    if (searchLabel && page.searchLabel) searchLabel.textContent = page.searchLabel;

    const searchInputEl = document.getElementById('transcriptSearch');
    if (searchInputEl && page.searchPlaceholder) {
        searchInputEl.placeholder = page.searchPlaceholder;
    }

    const topSection = document.getElementById('topClipsSection');
    const topTitle = document.getElementById('topClipsTitle');
    const topSub = document.getElementById('topClipsSubtitle');
    const enabled = !!(topClipsConfig && topClipsConfig.enabled !== false && (topClipsConfig.clips || []).length);
    if (topSection) {
        topSection.hidden = !enabled;
        if (enabled) {
            if (topTitle && topClipsConfig.title) topTitle.textContent = topClipsConfig.title;
            if (topSub && topClipsConfig.subtitle) topSub.textContent = topClipsConfig.subtitle;
            topSection.setAttribute('aria-label', topClipsConfig.title || 'Top clips');
        }
    }
}

function renderPromo(promoConfig) {
    const section = document.getElementById('promoSection');
    const playerHost = document.getElementById('promoPlayer');
    const titleEl = document.getElementById('promoTitle');
    if (!section || !playerHost) return;

    const src = promoConfig && promoConfig.src ? String(promoConfig.src).trim() : '';
    if (!src) {
        section.hidden = true;
        playerHost.innerHTML = '';
        promoVideoEl = null;
        return;
    }

    const title = promoConfig.title ? String(promoConfig.title).trim() : '';
    if (titleEl) {
        if (title) {
            titleEl.textContent = title;
            titleEl.hidden = false;
        } else {
            titleEl.textContent = '';
            titleEl.hidden = true;
        }
    }
    section.setAttribute('aria-label', title || 'Promo video');

    playerHost.innerHTML = '';
    const videoEl = document.createElement('video');
    videoEl.controls = true;
    videoEl.playsInline = true;
    videoEl.preload = 'metadata';
    videoEl.controlsList = 'nodownload';
    videoEl.oncontextmenu = () => false;
    if (promoConfig.poster) {
        videoEl.poster = resolveAssetUrl(promoConfig.poster);
    }

    const source = document.createElement('source');
    source.src = resolveAssetUrl(src);
    source.type = 'video/mp4';
    videoEl.appendChild(source);
    playerHost.appendChild(videoEl);

    promoVideoEl = videoEl;
    videoEl.addEventListener('play', () => pauseAllVideos(videoEl));
    initPlyrVideo(videoEl, { filteredPoster: false });
    section.hidden = false;
}


function escRe(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightMatch(text, query) {
    if (!query) return escHtml(text);
    const re = new RegExp(`(${escRe(query)})`, 'gi');
    return escHtml(text).replace(re, '<mark>$1</mark>');
}

function getCueContextLines(cues, index) {
    const lines = [];
    if (index > 0) {
        lines.push({ type: 'before', text: cues[index - 1].text });
    }
    lines.push({ type: 'match', text: cues[index].text });
    if (index < cues.length - 1) {
        lines.push({ type: 'after', text: cues[index + 1].text });
    }
    return lines;
}

function createSearchResultContextHTML(cues, index, query) {
    const lines = getCueContextLines(cues, index);
    return `<div class="search-result-context">${lines.map(line =>
        `<div class="context-line ${line.type}">${highlightMatch(line.text, query)}</div>`
    ).join('')}</div>`;
}

const expandedViewText = 'Show only titles';
const condensedViewText = 'Expand All Videos';

function setCondensedButtonState(toggleBtn, allCondensed) {
    if (!toggleBtn) return;
    toggleBtn.dataset.allCondensed = String(allCondensed);
    toggleBtn.title = allCondensed ? 'Expand all videos' : 'Condense all videos';
    toggleBtn.setAttribute('aria-pressed', String(allCondensed));
    toggleBtn.innerHTML = allCondensed ? condensedViewText : expandedViewText;
}

function updateCondensedToggleState() {
    const toggleAllBtn = document.querySelector('#toggleAllVideos');
    if (!toggleAllBtn) return;
    const cards = document.querySelectorAll('.video-card');
    const allCondensed = cards.length > 0 && Array.from(cards).every(card => card.classList.contains('condensed'));
    setCondensedButtonState(toggleAllBtn, allCondensed);
}

function setAllCardsCondensed(condensed) {
    const cards = document.querySelectorAll('.video-card');
    cards.forEach(card => {
        if (condensed) {
            card.classList.add('condensed');
        } else {
            card.classList.remove('condensed');
        }
    });
    updateCondensedToggleState();
}

function toggleAllCardsCondensed() {
    const cards = document.querySelectorAll('.video-card');
    const allCondensed = cards.length > 0 && Array.from(cards).every(card => card.classList.contains('condensed'));
    setAllCardsCondensed(!allCondensed);
}

// ─────────────────────────────────────────────────────────────────────
//  SRT parser → array of { start, end, startLabel, text }
// ─────────────────────────────────────────────────────────────────────
function parseSrt(raw) {
    const cues = [];
    const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const blocks = normalized.split(/\n{2,}/);
    const timePat = new RegExp(
        '(\\d{2}:\\d{2}:\\d{2})[.,](\\d{3})\\s*-->\\s*(\\d{2}:\\d{2}:\\d{2})[.,](\\d{3})'
    );

    for (const block of blocks) {
        const lines = block.trim().split('\n');
        if (lines.length < 2) continue;
        let timeLine = -1;
        for (let i = 0; i < lines.length; i++) {
            if (timePat.test(lines[i])) { timeLine = i; break; }
        }
        if (timeLine === -1) continue;
        const m = lines[timeLine].match(timePat);
        if (!m) continue;
        const startSec = srtTimeToSeconds(m[1], m[2]);
        const cueText = lines.slice(timeLine + 1).join(' ').trim();
        if (!cueText) continue;
        cues.push({
            start: startSec,
            end: srtTimeToSeconds(m[3], m[4]),
            startLabel: formatTime(startSec),
            text: cueText
        });
    }
    return cues;
}

function normalizeUrl(url) {
    return url.replace(/^(https?:)\/([^/])/, '$1//$2');
}

function parseSrtTimestamp(value) {
    const match = value.trim().match(/^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/);
    if (!match) return Number.NaN;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    const millis = Number(match[4]);
    return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

function extractUrlsFromText(text) {
    const regex = /https?:\/\/[^\s)<>\]]+/gi;
    const seen = new Set();
    const urls = [];

    for (const match of text.matchAll(regex)) {
        const raw = match[0].replace(/[.,;:!?)]+$/, '');
        const normalized = normalizeUrl(raw);
        if (!seen.has(normalized)) {
            seen.add(normalized);
            urls.push(normalized);
        }
    }

    return urls;
}

function parseSrtCuesForUrls(srt) {
    const normalized = srt.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    const cues = [];

    for (const block of normalized.split(/\n\n+/)) {
        const lines = block.split('\n');
        const timeLineIndex = lines.findIndex(line => line.includes('-->'));
        if (timeLineIndex === -1) continue;

        const [startStr, endStr] = lines[timeLineIndex].split('-->').map(part => part.trim());
        const start = parseSrtTimestamp(startStr);
        const end = parseSrtTimestamp(endStr);
        if (!Number.isFinite(start) || !Number.isFinite(end)) continue;

        cues.push({
            start,
            end,
            text: lines.slice(timeLineIndex + 1).join('\n'),
        });
    }

    return cues;
}

function cueOverlapsRange(cue, rangeStart, rangeStop) {
    const rangeEnd = rangeStop ?? Number.POSITIVE_INFINITY;
    return cue.end > rangeStart && cue.start < rangeEnd;
}

function extractUrlsFromSrt(srt, rangeStart = 0, rangeStop = null) {
    const cues = parseSrtCuesForUrls(srt);
    const seen = new Set();
    const urls = [];

    for (const cue of cues) {
        if (!cueOverlapsRange(cue, rangeStart, rangeStop)) continue;
        for (const url of extractUrlsFromText(cue.text)) {
            if (!seen.has(url)) {
                seen.add(url);
                urls.push(url);
            }
        }
    }

    return urls;
}

// ─────────────────────────────────────────────────────────────────────
//  In-memory transcript store  path → { status, cues, rawText }
//  status: 'loading' | 'ready' | 'error'
// ─────────────────────────────────────────────────────────────────────
const transcriptStore = {};
const transcriptPromises = {};  // path → Promise — kept so in-flight fetches are reusable
const videoElementMap = {};   // path → <video> element

function pauseAllVideos(exceptVideo) {
    for (const key in videoElementMap) {
        const otherVideo = videoElementMap[key];
        if (otherVideo && otherVideo !== exceptVideo && !otherVideo.paused) {
            otherVideo.pause();
        }
    }
    if (promoVideoEl && promoVideoEl !== exceptVideo && !promoVideoEl.paused) {
        promoVideoEl.pause();
    }
    if (modalVideoEl && modalVideoEl !== exceptVideo && !modalVideoEl.paused) {
        modalVideoEl.pause();
    }
}

function loadTranscript(video) {
    const id = video.path;
    // Return the existing promise so concurrent callers all wait for the same fetch
    if (transcriptPromises[id]) return transcriptPromises[id];
    transcriptStore[id] = { status: 'loading', cues: [], rawText: '' };

    transcriptPromises[id] = fetch(video.subtitle)
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
        .then(raw => {
            transcriptStore[id].rawText = raw;
            transcriptStore[id].cues = parseSrt(raw);
            transcriptStore[id].status = 'ready';
            return transcriptStore[id];
        })
        .catch(() => {
            transcriptStore[id].status = 'error';
            return transcriptStore[id];
        });
    return transcriptPromises[id];
}

function attachVttTrack(videoEl, rawSrt) {
    // Avoid adding duplicate tracks
    if (videoEl.querySelector('track[srclang="en"]')) return;
    const vtt = 'WEBVTT\n\n' + rawSrt
        .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    const blob = new Blob([vtt], { type: 'text/vtt' });
    const blobUrl = URL.createObjectURL(blob);
    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.srclang = 'en';
    track.label = 'English';
    track.default = true;
    track.src = blobUrl;
    track.addEventListener('load', () => {
        URL.revokeObjectURL(blobUrl);
        syncPlyrCaptions(videoEl);
    }, { once: true });
    track.addEventListener('error', () => URL.revokeObjectURL(blobUrl), { once: true });
    videoEl.appendChild(track);
}

// ─────────────────────────────────────────────────────────────────────
//  Cue line element (shared by accordion and search results)
// ─────────────────────────────────────────────────────────────────────
function makeCueLine(cue, videoPath, highlightQuery, targetVideoEl) {
    const div = document.createElement('div');
    div.className = 'cue-line';
    div.setAttribute('role', 'listitem');
    div.setAttribute('tabindex', '0');
    div.dataset.cueStart = String(cue.start);
    div.title = `Jump to ${cue.startLabel}`;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'cue-time';
    timeSpan.textContent = cue.startLabel;

    const textSpan = document.createElement('span');
    textSpan.className = 'cue-text';
    if (highlightQuery) {
        textSpan.innerHTML = highlightMatch(cue.text, highlightQuery);
    } else {
        textSpan.textContent = cue.text;
    }

    div.appendChild(timeSpan);
    div.appendChild(textSpan);

    const seek = () => {
        const videoEl = targetVideoEl || videoElementMap[videoPath];
        if (!videoEl) return;
        videoEl.currentTime = cue.start;
        videoEl.play();
        if (!targetVideoEl) {
            videoEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };
    div.addEventListener('click', seek);
    div.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); seek(); }
    });
    return div;
}

// ─────────────────────────────────────────────────────────────────────
//  Video modal (side-by-side draggable + resizable panels)
// ─────────────────────────────────────────────────────────────────────
let videoModalOverlay = null;
let modalVideoEl = null;
let modalTranscriptBody = null;
let modalTranscriptSyncBtn = null;
let modalTranscriptViewBtn = null;
let modalTranscriptSearchInput = null;
let modalTranscriptSearchStatus = null;
let modalTranscriptStore = null;
let modalTranscriptVideoPath = null;
let modalTranscriptSearchTimer = null;
let modalTranscriptPlainView = false;
let modalLinksSection = null;
let modalTitleEl = null;
let modalCopyBtn = null;
let modalClearTimestampsBtn = null;
let modalCopyHint = null;
let modalClipTimer = null;
let modalClipTimerValue = null;
let modalVideoId = null;
let modalPreviousFocus = null;
let modalSourceVideoPath = null;
let modalWorkspace = null;
let modalPanelZIndex = 2;
let copyRangeStart = null;
let clipEndTime = null;
let clipTimeUpdateHandler = null;
let copyFlashTimer = null;

const COPY_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
const COPY_CHECK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
const CLEAR_TIMESTAMPS_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline><line x1="4" y1="4" x2="20" y2="20"></line></svg>';

function formatClipCountdown(seconds) {
    const total = Math.max(0, Math.ceil(seconds));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
}

function clearClipPlayback() {
    if (modalVideoEl && clipTimeUpdateHandler) {
        modalVideoEl.removeEventListener('timeupdate', clipTimeUpdateHandler);
    }
    clipTimeUpdateHandler = null;
    clipEndTime = null;
    if (modalClipTimer) {
        modalClipTimer.classList.remove('is-visible');
        modalClipTimer.hidden = true;
    }
    if (modalClipTimerValue) {
        modalClipTimerValue.textContent = '';
    }
}

function updateClipTimerDisplay() {
    if (!modalVideoEl || clipEndTime === null || !modalClipTimerValue) return;
    const remaining = clipEndTime - modalVideoEl.currentTime;
    modalClipTimerValue.textContent = formatClipCountdown(remaining);
    if (remaining <= 0) {
        modalVideoEl.pause();
        modalClipTimerValue.textContent = '0:00';
        // Release the end-stop so Play can continue past the clip if desired
        if (clipTimeUpdateHandler) {
            modalVideoEl.removeEventListener('timeupdate', clipTimeUpdateHandler);
            clipTimeUpdateHandler = null;
        }
        clipEndTime = null;
        const onResume = () => {
            clearClipPlayback();
            modalVideoEl.removeEventListener('play', onResume);
        };
        modalVideoEl.addEventListener('play', onResume, { once: true });
    }
}

function setupClipPlayback(endTime) {
    clearClipPlayback();
    if (typeof endTime !== 'number' || !Number.isFinite(endTime) || endTime <= 0) return;

    clipEndTime = endTime;
    if (modalClipTimer) {
        modalClipTimer.hidden = false;
        modalClipTimer.classList.add('is-visible');
    }

    clipTimeUpdateHandler = () => updateClipTimerDisplay();
    modalVideoEl.addEventListener('timeupdate', clipTimeUpdateHandler);
    updateClipTimerDisplay();
}

function setCopyPendingHintVisible(visible) {
    if (!modalCopyHint) return;
    modalCopyHint.classList.toggle('is-visible', visible);
    modalCopyHint.hidden = !visible;
}

function setCopyPendingUi(pending) {
    if (!modalCopyBtn) return;
    modalCopyBtn.classList.toggle('is-pending-start', pending);
    modalCopyBtn.title = pending
        ? 'Start set — click again at the end, or here again for start-only'
        : 'Copy link';
    setCopyPendingHintVisible(pending);
}

function resetCopyRangeState() {
    copyRangeStart = null;
    if (copyFlashTimer) {
        clearTimeout(copyFlashTimer);
        copyFlashTimer = null;
    }
    if (modalCopyBtn) {
        modalCopyBtn.innerHTML = COPY_ICON_SVG;
    }
    setCopyPendingUi(false);
}

function flashCopyButtonSuccess(pendingStart) {
    if (!modalCopyBtn) return;
    if (copyFlashTimer) {
        clearTimeout(copyFlashTimer);
        copyFlashTimer = null;
    }
    modalCopyBtn.innerHTML = COPY_CHECK_SVG;
    setCopyPendingUi(pendingStart);
    copyFlashTimer = setTimeout(() => {
        copyFlashTimer = null;
        if (!modalCopyBtn) return;
        modalCopyBtn.innerHTML = COPY_ICON_SVG;
    }, 1000);
}

function buildShareUrl(videoId, startTime, endTime) {
    let url = `${window.location.origin}${window.location.pathname}#${videoId}`;
    const start = Math.floor(typeof startTime === 'number' ? startTime : 0);
    if (start > 0 || (typeof endTime === 'number' && Number.isFinite(endTime))) {
        url += `&t=${Math.max(0, start)}`;
    }
    if (typeof endTime === 'number' && Number.isFinite(endTime) && endTime > start) {
        url += `&e=${Math.floor(endTime)}`;
    }
    return url;
}

function copyShareUrl(url, pendingStart) {
    navigator.clipboard.writeText(url).then(() => {
        flashCopyButtonSuccess(pendingStart);
    });
}

function bringModalPanelToFront(panel) {
    modalPanelZIndex += 1;
    panel.style.zIndex = String(modalPanelZIndex);
}

function clampModalPanelPosition(panel) {
    if (!modalWorkspace) return;
    const maxLeft = Math.max(0, modalWorkspace.clientWidth - panel.offsetWidth);
    const maxTop = Math.max(0, modalWorkspace.clientHeight - panel.offsetHeight);
    const left = Math.min(Math.max(0, panel.offsetLeft), maxLeft);
    const top = Math.min(Math.max(0, panel.offsetTop), maxTop);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
}

function initModalPanelDrag(panel, handle) {
    handle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        bringModalPanelToFront(panel);
        panel.classList.add('is-dragging');

        const startX = e.clientX;
        const startY = e.clientY;
        const startLeft = panel.offsetLeft;
        const startTop = panel.offsetTop;

        handle.setPointerCapture(e.pointerId);

        const onMove = (ev) => {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            const maxLeft = Math.max(0, modalWorkspace.clientWidth - panel.offsetWidth);
            const maxTop = Math.max(0, modalWorkspace.clientHeight - panel.offsetHeight);
            panel.style.left = `${Math.min(Math.max(0, startLeft + dx), maxLeft)}px`;
            panel.style.top = `${Math.min(Math.max(0, startTop + dy), maxTop)}px`;
        };

        const onEnd = () => {
            panel.classList.remove('is-dragging');
            handle.removeEventListener('pointermove', onMove);
            handle.removeEventListener('pointerup', onEnd);
            handle.removeEventListener('pointercancel', onEnd);
            if (handle.hasPointerCapture(e.pointerId)) {
                handle.releasePointerCapture(e.pointerId);
            }
        };

        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onEnd);
        handle.addEventListener('pointercancel', onEnd);
    });

    panel.addEventListener('pointerdown', () => bringModalPanelToFront(panel));
}

function createModalPanel(className, label) {
    const panel = document.createElement('div');
    panel.className = `video-modal-panel ${className}`;

    const handle = document.createElement('div');
    handle.className = 'video-modal-panel-handle';
    handle.setAttribute('aria-label', `Drag ${label} panel`);

    const handleLabel = document.createElement('span');
    handleLabel.className = 'video-modal-panel-handle-label';
    handleLabel.textContent = label;

    const handleHint = document.createElement('span');
    handleHint.className = 'video-modal-panel-handle-hint';
    handleHint.textContent = 'Drag header · resize corner';

    handle.appendChild(handleLabel);
    handle.appendChild(handleHint);

    const content = document.createElement('div');
    content.className = 'video-modal-panel-content';

    panel.appendChild(handle);
    panel.appendChild(content);
    initModalPanelDrag(panel, handle);

    return { panel, content };
}

function scrollElementIntoContainer(container, element) {
    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const relativeTop = elementRect.top - containerRect.top + container.scrollTop;
    const targetTop = relativeTop - (container.clientHeight / 2) + (element.clientHeight / 2);
    container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
}

function scrollModalTranscriptToCurrentTime() {
    if (!modalVideoEl || !modalTranscriptBody) return;

    const time = modalVideoEl.currentTime;
    const cueLines = modalTranscriptBody.querySelectorAll('.cue-line[data-cue-start]');
    if (!cueLines.length) return;

    let targetLine = cueLines[0];
    for (const line of cueLines) {
        const start = Number.parseFloat(line.dataset.cueStart);
        if (Number.isFinite(start) && start <= time) {
            targetLine = line;
        } else {
            break;
        }
    }

    scrollElementIntoContainer(modalTranscriptBody, targetLine);
    flashModalTranscriptCue(targetLine);
}

function flashModalTranscriptCue(line) {
    if (!line || !modalTranscriptBody) return;

    modalTranscriptBody.querySelectorAll('.cue-line.is-current-position').forEach((el) => {
        el.classList.remove('is-current-position');
    });

    // Restart the animation if the same line is targeted again
    void line.offsetWidth;
    line.classList.add('is-current-position');

    const clearFlash = () => {
        line.classList.remove('is-current-position');
        line.removeEventListener('animationend', clearFlash);
    };
    line.addEventListener('animationend', clearFlash);
}

function setModalTranscriptSyncEnabled(enabled) {
    if (!modalTranscriptSyncBtn) return;
    modalTranscriptSyncBtn.disabled = !enabled;
}

function concatenateCueTexts(cues) {
    return cues
        .map(cue => cue.text.trim())
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .replace(/\s+([.,!?;:])/g, '$1')
        .trim();
}

function updateModalTranscriptViewBtn() {
    if (!modalTranscriptViewBtn) return;
    modalTranscriptViewBtn.setAttribute('aria-pressed', modalTranscriptPlainView ? 'true' : 'false');
    modalTranscriptViewBtn.textContent = modalTranscriptPlainView ? 'Timed cues' : 'Readable text';
    modalTranscriptViewBtn.title = modalTranscriptPlainView
        ? 'Show transcript with timestamps'
        : 'Show concatenated transcript without timestamps';
    modalTranscriptViewBtn.setAttribute(
        'aria-label',
        modalTranscriptPlainView
            ? 'Switch to timed cue view'
            : 'Switch to readable text without timestamps'
    );
}

function setModalTranscriptViewEnabled(enabled) {
    if (!modalTranscriptViewBtn) return;
    modalTranscriptViewBtn.disabled = !enabled;
}

function ensureVideoModal() {
    if (videoModalOverlay) return;

    videoModalOverlay = document.createElement('div');
    videoModalOverlay.className = 'video-modal-overlay';
    videoModalOverlay.hidden = true;
    videoModalOverlay.setAttribute('role', 'presentation');

    const dialog = document.createElement('div');
    dialog.className = 'video-modal';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'videoModalTitle');

    const header = document.createElement('div');
    header.className = 'video-modal-header';

    modalTitleEl = document.createElement('h2');
    modalTitleEl.className = 'video-modal-title';
    modalTitleEl.id = 'videoModalTitle';

    const headerActions = document.createElement('div');
    headerActions.className = 'video-modal-header-actions';

    modalCopyBtn = document.createElement('button');
    modalCopyBtn.type = 'button';
    modalCopyBtn.className = 'copy-button';
    modalCopyBtn.title = 'Copy link';
    modalCopyBtn.innerHTML = COPY_ICON_SVG;
    modalCopyBtn.addEventListener('click', () => {
        if (!modalVideoId || !modalVideoEl) return;
        const currentTime = Math.floor(modalVideoEl.currentTime);

        if (copyRangeStart === null) {
            // Starting a new cycle: drop any existing t/e stamps first
            clearExistingShareTimestamps();
            copyRangeStart = currentTime;
            setCopyPendingUi(true);
            updateVideoUrlForModal(modalVideoId, currentTime);
            copyShareUrl(buildShareUrl(modalVideoId, currentTime), true);
            return;
        }

        if (currentTime === copyRangeStart) {
            const startOnly = copyRangeStart;
            resetCopyRangeState();
            updateVideoUrlForModal(modalVideoId, startOnly);
            copyShareUrl(buildShareUrl(modalVideoId, startOnly), false);
            return;
        }

        const start = Math.min(copyRangeStart, currentTime);
        const end = Math.max(copyRangeStart, currentTime);
        resetCopyRangeState();
        updateVideoUrlForModal(modalVideoId, start, end);
        copyShareUrl(buildShareUrl(modalVideoId, start, end), false);
    });

    modalCopyHint = document.createElement('div');
    modalCopyHint.className = 'copy-pending-hint';
    modalCopyHint.hidden = true;
    modalCopyHint.setAttribute('role', 'status');
    modalCopyHint.setAttribute('aria-live', 'polite');
    modalCopyHint.textContent = 'Start set — click again for start-only, or move later and click to set the end.';

    modalClearTimestampsBtn = document.createElement('button');
    modalClearTimestampsBtn.type = 'button';
    modalClearTimestampsBtn.className = 'copy-button clear-timestamps-button';
    modalClearTimestampsBtn.title = 'Clear timestamps';
    modalClearTimestampsBtn.setAttribute('aria-label', 'Clear timestamps from link');
    modalClearTimestampsBtn.innerHTML = CLEAR_TIMESTAMPS_ICON_SVG;
    modalClearTimestampsBtn.addEventListener('click', () => {
        if (!modalVideoId) return;
        clearAllTimestamps();
    });

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'video-modal-close';
    closeBtn.setAttribute('aria-label', 'Close video');
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', closeVideoModal);

    headerActions.appendChild(modalCopyHint);
    headerActions.appendChild(modalCopyBtn);
    headerActions.appendChild(modalClearTimestampsBtn);
    headerActions.appendChild(closeBtn);

    header.appendChild(modalTitleEl);
    header.appendChild(headerActions);

    modalWorkspace = document.createElement('div');
    modalWorkspace.className = 'video-modal-workspace';

    const { panel: videoPanel, content: videoContent } = createModalPanel('video-modal-panel--video', 'Video');
    const playerWrap = document.createElement('div');
    playerWrap.className = 'video-modal-player';

    modalVideoEl = document.createElement('video');
    modalVideoEl.controls = true;
    modalVideoEl.playsInline = true;
    modalVideoEl.controlsList = 'nodownload';
    modalVideoEl.oncontextmenu = () => false;
    modalVideoEl.addEventListener('play', () => pauseAllVideos(modalVideoEl));

    const source = document.createElement('source');
    source.type = 'video/mp4';
    modalVideoEl.appendChild(source);
    playerWrap.appendChild(modalVideoEl);

    modalClipTimer = document.createElement('div');
    modalClipTimer.className = 'clip-timer';
    modalClipTimer.hidden = true;
    modalClipTimer.setAttribute('aria-live', 'polite');
    modalClipTimer.setAttribute('aria-label', 'Clip time remaining');
    const clipTimerLabel = document.createElement('span');
    clipTimerLabel.className = 'clip-timer-label';
    clipTimerLabel.textContent = 'Clip';
    modalClipTimerValue = document.createElement('span');
    modalClipTimerValue.className = 'clip-timer-value';
    modalClipTimer.appendChild(clipTimerLabel);
    modalClipTimer.appendChild(modalClipTimerValue);
    playerWrap.appendChild(modalClipTimer);

    videoContent.appendChild(playerWrap);

    modalLinksSection = document.createElement('div');
    modalLinksSection.className = 'video-modal-links';
    modalLinksSection.hidden = true;
    videoContent.appendChild(modalLinksSection);

    initPlyrVideo(modalVideoEl);
    // Keep the clip timer above Plyr's rebuilt player chrome
    playerWrap.appendChild(modalClipTimer);

    const { panel: transcriptPanel, content: transcriptContent } = createModalPanel('video-modal-panel--transcript', 'Transcript');
    const transcriptSection = document.createElement('div');
    transcriptSection.className = 'video-modal-transcript';

    const transcriptToolbar = document.createElement('div');
    transcriptToolbar.className = 'video-modal-transcript-toolbar';

    modalTranscriptSyncBtn = document.createElement('button');
    modalTranscriptSyncBtn.type = 'button';
    modalTranscriptSyncBtn.className = 'video-modal-transcript-sync-btn';
    modalTranscriptSyncBtn.textContent = 'Go to current position';
    modalTranscriptSyncBtn.setAttribute('aria-label', 'Scroll transcript to the subtitle at the current playback position');
    modalTranscriptSyncBtn.disabled = true;
    modalTranscriptSyncBtn.addEventListener('click', scrollModalTranscriptToCurrentTime);

    modalTranscriptViewBtn = document.createElement('button');
    modalTranscriptViewBtn.type = 'button';
    modalTranscriptViewBtn.className = 'video-modal-transcript-view-btn';
    modalTranscriptViewBtn.disabled = true;
    updateModalTranscriptViewBtn();
    modalTranscriptViewBtn.addEventListener('click', () => {
        modalTranscriptPlainView = !modalTranscriptPlainView;
        updateModalTranscriptViewBtn();
        runModalTranscriptSearch();
    });

    const searchWrap = document.createElement('div');
    searchWrap.className = 'video-modal-transcript-search-wrap';

    modalTranscriptSearchInput = document.createElement('input');
    modalTranscriptSearchInput.type = 'search';
    modalTranscriptSearchInput.className = 'video-modal-transcript-search';
    modalTranscriptSearchInput.placeholder = 'Search this transcript…';
    modalTranscriptSearchInput.autocomplete = 'off';
    modalTranscriptSearchInput.disabled = true;
    modalTranscriptSearchInput.setAttribute('aria-label', 'Search this transcript');
    modalTranscriptSearchInput.addEventListener('input', () => {
        clearTimeout(modalTranscriptSearchTimer);
        modalTranscriptSearchTimer = setTimeout(runModalTranscriptSearch, 200);
    });

    modalTranscriptSearchStatus = document.createElement('span');
    modalTranscriptSearchStatus.className = 'video-modal-transcript-search-status';
    modalTranscriptSearchStatus.setAttribute('aria-live', 'polite');

    searchWrap.appendChild(modalTranscriptSearchInput);
    searchWrap.appendChild(modalTranscriptSearchStatus);

    transcriptToolbar.appendChild(searchWrap);
    transcriptToolbar.appendChild(modalTranscriptViewBtn);
    transcriptToolbar.appendChild(modalTranscriptSyncBtn);

    modalTranscriptBody = document.createElement('div');
    modalTranscriptBody.className = 'video-modal-transcript-body';
    modalTranscriptBody.setAttribute('role', 'list');

    transcriptSection.appendChild(transcriptToolbar);
    transcriptSection.appendChild(modalTranscriptBody);
    transcriptContent.appendChild(transcriptSection);

    modalWorkspace.appendChild(videoPanel);
    modalWorkspace.appendChild(transcriptPanel);

    dialog.appendChild(header);
    dialog.appendChild(modalWorkspace);
    videoModalOverlay.appendChild(dialog);

    const clampPanels = () => {
        clampModalPanelPosition(videoPanel);
        clampModalPanelPosition(transcriptPanel);
    };
    window.addEventListener('resize', clampPanels);
    [videoPanel, transcriptPanel].forEach((panel) => {
        panel.addEventListener('mouseup', clampPanels);
    });

    videoModalOverlay.addEventListener('click', (e) => {
        if (e.target === videoModalOverlay) closeVideoModal();
    });

    document.body.appendChild(videoModalOverlay);
}

function renderModalLinks(rawSrt) {
    if (!modalLinksSection) return;
    modalLinksSection.innerHTML = '';
    modalLinksSection.hidden = true;
    if (!rawSrt) return;

    const urls = extractUrlsFromSrt(rawSrt);
    if (!urls.length) return;

    modalLinksSection.hidden = false;

    const heading = document.createElement('p');
    heading.className = 'video-modal-links-heading';
    heading.textContent = 'Links';

    const list = document.createElement('ul');
    list.className = 'subtitle-links';
    for (const link of urls) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = link;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = link;
        li.appendChild(a);
        list.appendChild(li);
    }

    modalLinksSection.appendChild(heading);
    modalLinksSection.appendChild(list);
}

function clearModalTranscriptSearch() {
    if (modalTranscriptSearchInput) modalTranscriptSearchInput.value = '';
    if (modalTranscriptSearchStatus) modalTranscriptSearchStatus.textContent = '';
}

function populateModalTranscript(store, videoPath, query = '') {
    modalTranscriptStore = store;
    modalTranscriptVideoPath = videoPath;
    modalTranscriptBody.innerHTML = '';
    modalTranscriptBody.removeAttribute('role');

    if (!store || store.status !== 'ready' || !store.cues.length) {
        setModalTranscriptSyncEnabled(false);
        setModalTranscriptViewEnabled(false);
        if (modalTranscriptSearchInput) modalTranscriptSearchInput.disabled = true;
        const loading = document.createElement('p');
        loading.className = 'transcript-loading';
        loading.textContent = store?.status === 'error'
            ? 'Transcript unavailable.'
            : 'Loading transcript…';
        modalTranscriptBody.appendChild(loading);
        return;
    }

    if (modalTranscriptSearchInput) modalTranscriptSearchInput.disabled = false;
    setModalTranscriptViewEnabled(true);

    const trimmedQuery = query.trim();
    const normalizedQuery = trimmedQuery.toLowerCase();
    const matchingCues = normalizedQuery
        ? store.cues.filter(cue => cue.text.toLowerCase().includes(normalizedQuery))
        : store.cues;

    if (normalizedQuery && !matchingCues.length) {
        setModalTranscriptSyncEnabled(false);
        const empty = document.createElement('p');
        empty.className = 'transcript-loading';
        empty.textContent = `No results for "${trimmedQuery}"`;
        modalTranscriptBody.appendChild(empty);
        if (modalTranscriptSearchStatus) {
            modalTranscriptSearchStatus.textContent = 'No matches';
        }
        return;
    }

    if (modalTranscriptPlainView) {
        const plain = document.createElement('p');
        plain.className = 'transcript-plain';
        const fullText = concatenateCueTexts(store.cues);
        if (normalizedQuery) {
            plain.innerHTML = highlightMatch(fullText, trimmedQuery);
        } else {
            plain.textContent = fullText;
        }
        modalTranscriptBody.appendChild(plain);
        setModalTranscriptSyncEnabled(false);

        if (modalTranscriptSearchStatus) {
            modalTranscriptSearchStatus.textContent = normalizedQuery
                ? `${matchingCues.length} match${matchingCues.length === 1 ? '' : 'es'}`
                : '';
        }

        if (normalizedQuery) {
            const firstMark = plain.querySelector('mark');
            if (firstMark) scrollElementIntoContainer(modalTranscriptBody, firstMark);
        }
        return;
    }

    modalTranscriptBody.setAttribute('role', 'list');
    const frag = document.createDocumentFragment();
    for (const cue of matchingCues) {
        frag.appendChild(makeCueLine(
            cue,
            videoPath,
            normalizedQuery ? trimmedQuery : null,
            modalVideoEl
        ));
    }
    modalTranscriptBody.appendChild(frag);
    setModalTranscriptSyncEnabled(!normalizedQuery);

    if (modalTranscriptSearchStatus) {
        modalTranscriptSearchStatus.textContent = normalizedQuery
            ? `${matchingCues.length} match${matchingCues.length === 1 ? '' : 'es'}`
            : '';
    }

    if (normalizedQuery && matchingCues.length) {
        const firstLine = modalTranscriptBody.querySelector('.cue-line');
        if (firstLine) scrollElementIntoContainer(modalTranscriptBody, firstLine);
    }
}

function runModalTranscriptSearch() {
    if (!modalTranscriptStore || !modalTranscriptVideoPath) return;
    populateModalTranscript(
        modalTranscriptStore,
        modalTranscriptVideoPath,
        modalTranscriptSearchInput?.value ?? ''
    );
}

function openVideoModal(video, startTime, endTime) {
    if (!video.subtitle) return;
    ensureVideoModal();

    modalPreviousFocus = document.activeElement;
    modalSourceVideoPath = video.path;
    modalVideoId = generateVideoId(video);
    modalCopyBtn.setAttribute('aria-label', `Copy link to ${video.title}`);
    resetCopyRangeState();
    clearClipPlayback();

    const cardVideo = videoElementMap[video.path];
    const wasPlaying = cardVideo && !cardVideo.paused;
    const time = typeof startTime === 'number' ? startTime : (cardVideo?.currentTime ?? 0);
    const hasClipEnd = typeof endTime === 'number' && Number.isFinite(endTime) && endTime > time;
    const shouldAutoplay = wasPlaying || hasClipEnd;

    if (cardVideo) cardVideo.pause();

    const sourceSrc = resolveAssetUrl(video.path);

    const source = modalVideoEl.querySelector('source');
    source.src = sourceSrc;
    modalVideoEl.querySelectorAll('track').forEach(t => t.remove());
    modalVideoEl.load();

    const seekModalVideo = () => {
        if (modalSourceVideoPath !== video.path) return;
        modalVideoEl.currentTime = time;
    };

    const seekAndMaybePlay = () => {
        seekModalVideo();
        if (hasClipEnd) setupClipPlayback(endTime);
        if (shouldAutoplay) modalVideoEl.play();
    };
    if (modalVideoEl.readyState >= 1) {
        seekAndMaybePlay();
    } else {
        modalVideoEl.addEventListener('loadedmetadata', seekAndMaybePlay, { once: true });
    }

    if (time > 0) {
        modalVideoEl.addEventListener('play', seekModalVideo, { once: true });
    }

    modalTitleEl.textContent = video.title;
    clearModalTranscriptSearch();
    modalTranscriptStore = null;
    modalTranscriptVideoPath = null;
    modalTranscriptPlainView = false;
    updateModalTranscriptViewBtn();
    setModalTranscriptSyncEnabled(false);
    setModalTranscriptViewEnabled(false);
    if (modalTranscriptSearchInput) modalTranscriptSearchInput.disabled = true;
    modalTranscriptBody.innerHTML = '<p class="transcript-loading">Loading transcript…</p>';
    renderModalLinks(null);

    loadTranscript(video).then(store => {
        if (modalSourceVideoPath !== video.path) return;
        if (store.rawText) attachVttTrack(modalVideoEl, store.rawText);
        populateModalTranscript(store, video.path, modalTranscriptSearchInput?.value ?? '');
        renderModalLinks(store.rawText);
    });

    videoModalOverlay.hidden = false;
    document.body.style.overflow = 'hidden';
    updateVideoUrlForModal(modalVideoId, time, hasClipEnd ? endTime : null);
    modalVideoEl.focus();
}

function closeVideoModal() {
    if (!videoModalOverlay || videoModalOverlay.hidden) return;

    const time = modalVideoEl.currentTime;
    modalVideoEl.pause();
    clearClipPlayback();
    resetCopyRangeState();

    const cardVideo = videoElementMap[modalSourceVideoPath];
    if (cardVideo) cardVideo.currentTime = time;

    videoModalOverlay.hidden = true;
    document.body.style.overflow = '';
    modalSourceVideoPath = null;
    modalTranscriptStore = null;
    modalTranscriptVideoPath = null;
    modalTranscriptPlainView = false;
    updateModalTranscriptViewBtn();
    clearModalTranscriptSearch();
    clearVideoUrlHash();

    if (modalPreviousFocus && typeof modalPreviousFocus.focus === 'function') {
        modalPreviousFocus.focus();
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && videoModalOverlay && !videoModalOverlay.hidden) {
        closeVideoModal();
    }
});

// ─────────────────────────────────────────────────────────────────────
//  Generate unique ID for a video
// ─────────────────────────────────────────────────────────────────────
function generateVideoId(video) {
    // Create a base ID from title 
    const baseId = video.title.toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    return baseId;
}

function findVideoById(videoId) {
    return videos.find(v => generateVideoId(v) === videoId) ?? null;
}

function getCurrentHashTimeRange() {
    const hash = window.location.hash;
    if (!hash) return { start: null, end: null };
    const hashPart = hash.substring(1);
    const ampIndex = hashPart.indexOf('&');
    const queryStr = ampIndex === -1 ? '' : hashPart.substring(ampIndex + 1);
    return parseHashTimeRange(queryStr);
}

function clearExistingShareTimestamps() {
    const { start, end } = getCurrentHashTimeRange();
    const hadStamps = start !== null || end !== null || clipEndTime !== null;
    if (!hadStamps) return false;

    clearClipPlayback();
    if (modalVideoId) {
        const cleanHash = `#${modalVideoId}`;
        const newUrl = `${window.location.pathname}${window.location.search}${cleanHash}`;
        history.replaceState(null, '', newUrl);
    }
    return true;
}

function clearAllTimestamps() {
    resetCopyRangeState();
    clearClipPlayback();
    if (modalVideoId) {
        const cleanHash = `#${modalVideoId}`;
        const newUrl = `${window.location.pathname}${window.location.search}${cleanHash}`;
        history.replaceState(null, '', newUrl);
    }
}

function buildVideoHash(videoId, time, endTime) {
    const t = Math.floor(typeof time === 'number' ? time : 0);
    let hash = `#${videoId}`;
    if (t > 0 || (typeof endTime === 'number' && Number.isFinite(endTime))) {
        hash += `&t=${Math.max(0, t)}`;
    }
    if (typeof endTime === 'number' && Number.isFinite(endTime) && endTime > t) {
        hash += `&e=${Math.floor(endTime)}`;
    }
    return hash;
}

function updateVideoUrlForModal(videoId, time, endTime) {
    const hash = buildVideoHash(videoId, time, endTime);
    const newUrl = `${window.location.pathname}${window.location.search}${hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (currentUrl === newUrl) return;
    history.replaceState(null, '', newUrl);
}

function clearVideoUrlHash() {
    if (!window.location.hash) return;
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
}

function parseHashTimeRange(queryStr) {
    if (!queryStr) return { start: null, end: null };

    let start = null;
    let end = null;
    const params = queryStr.split('&');
    for (const param of params) {
        if (param.startsWith('t=')) {
            const timestamp = parseFloat(param.substring(2));
            if (!isNaN(timestamp) && timestamp >= 0) start = timestamp;
        } else if (param.startsWith('e=')) {
            const timestamp = parseFloat(param.substring(2));
            if (!isNaN(timestamp) && timestamp >= 0) end = timestamp;
        }
    }

    if (start !== null && end !== null && end < start) {
        const swap = start;
        start = end;
        end = swap;
    }

    return { start, end };
}

// ─────────────────────────────────────────────────────────────────────
//  Build a video card
// ─────────────────────────────────────────────────────────────────────
function createVideoCard(video) {
    const card = document.createElement('article');
    card.className = 'video-card';

    // Generate unique ID for this video
    const videoId = generateVideoId(video);
    card.id = videoId;

    // ── video player ──
    const thumbDiv = document.createElement('div');
    thumbDiv.className = 'video-thumbnail';

    const videoEl = document.createElement('video');
    videoEl.controls = true;
    videoEl.poster = getSpeakerPoster(video);
    videoEl.preload = 'none';
    videoEl.playsInline = "true";
    videoEl.controlsList = "nodownload";
    videoEl.oncontextmenu = () => false;  // Disable right-click on video for an extra layer of download prevention

    const source = document.createElement('source');
    const sourceSrc = resolveAssetUrl(video.path);
    source.src = sourceSrc;
    source.type = 'video/mp4';
    videoEl.appendChild(source);
    thumbDiv.appendChild(videoEl);
    initPlyrVideo(videoEl);
    card.appendChild(thumbDiv);

    videoElementMap[video.path] = videoEl;
    if (!window.videoCardMap) {
        window.videoCardMap = new Map();
    }
    window.videoCardMap.set(video.path, card);
    videoEl.addEventListener('play', () => pauseAllVideos(videoEl));

    // ── info ──
    const infoDiv = document.createElement('div');
    infoDiv.className = 'video-info';

    const titleEl = document.createElement('h3');
    titleEl.className = 'video-title';
    // Create a span for the video camera icon
    const iconSpan = document.createElement('span');
    iconSpan.className = 'video-icon';
    iconSpan.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 5px;"><rect x="3" y="7" width="14" height="11" rx="2"/><path d="M7 7l2-3h4l2 3"/><circle cx="13" cy="13.5" r="3"/></svg>';
    // Create title text node
    const titleText = document.createTextNode(video.title);
    // Append icon and title to the title element
    titleEl.appendChild(iconSpan);
    titleEl.appendChild(titleText);
    infoDiv.appendChild(titleEl);

    const metaDiv = document.createElement('div');
    metaDiv.className = 'video-meta';
    const durSpan = document.createElement('span');
    durSpan.className = 'video-duration';
    durSpan.textContent = video.duration;

    metaDiv.appendChild(durSpan);
    infoDiv.appendChild(metaDiv);

    if (video.subtitle || video.presentation) {
        const actionsRow = document.createElement('div');
        actionsRow.className = 'video-card-actions';

        if (video.subtitle) {
            const modalBtn = document.createElement('button');
            modalBtn.type = 'button';
            modalBtn.className = 'open-video-modal-btn';
            modalBtn.setAttribute('aria-label', `Open ${video.title} with transcript`);
            modalBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg> Watch with transcript';
            modalBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openVideoModal(video, videoEl.currentTime);
            });
            actionsRow.appendChild(modalBtn);
        }

        if (video.presentation) {
            const pdfUrl = resolveAssetUrl(video.presentation);

            const pdfDownload = document.createElement('a');
            pdfDownload.className = 'download-presentation-btn';
            pdfDownload.href = pdfUrl;
            pdfDownload.download = '';
            pdfDownload.setAttribute('aria-label', `Download presentation PDF for ${video.title}`);
            pdfDownload.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/></svg> Download PDF';
            pdfDownload.addEventListener('click', (e) => e.stopPropagation());
            actionsRow.appendChild(pdfDownload);

            const pdfView = document.createElement('a');
            pdfView.className = 'view-presentation-btn';
            pdfView.href = pdfUrl;
            pdfView.target = '_blank';
            pdfView.rel = 'noopener noreferrer';
            pdfView.setAttribute('aria-label', `Open presentation PDF for ${video.title} in a new tab`);
            pdfView.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg> Open PDF';
            pdfView.addEventListener('click', (e) => e.stopPropagation());
            actionsRow.appendChild(pdfView);
        }

        infoDiv.appendChild(actionsRow);
    }

    card.appendChild(infoDiv);

    const toggleAllBtn = document.querySelector('#toggleAllVideos');
    if (toggleAllBtn && !toggleAllBtn.dataset.cardToggleInitialized) {
        toggleAllBtn.dataset.cardToggleInitialized = 'true';
        setCondensedButtonState(toggleAllBtn, false);
        toggleAllBtn.addEventListener('click', () => {
            toggleAllCardsCondensed();
        });
    }

    card.addEventListener('click', (event) => {
        if (!card.classList.contains('condensed')) return;
        card.classList.remove('condensed');
        updateCondensedToggleState();
    });

    return card;
}





async function initGallery(config) {
    renderPageChrome(config.page, config.topClips);
    renderPromo(config.promo);

    videos = Array.isArray(config.videos) ? config.videos : [];
    videos.forEach((v) => {
        if (v.subtitle) v.subtitle = resolveAssetUrl(v.subtitle);
        if (v.presentation) v.presentation = resolveAssetUrl(v.presentation);
    });
    speakerPhotos = config.speakerPhotos || {};
    defaultPoster = config.defaultPoster || '';
    topClips = (config.topClips && Array.isArray(config.topClips.clips)) ? config.topClips.clips : [];
    dayOrder = Array.isArray(config.days) && config.days.length
        ? config.days
        : [...new Set(videos.map((v) => v.day))];

// ─────────────────────────────────────────────────────────────────────
//  Render day sections
// ─────────────────────────────────────────────────────────────────────
const container = document.getElementById('videoContainer');

const sorted = [...videos].sort((a, b) =>
    a.day !== b.day
        ? a.day.localeCompare(b.day)
        : (a.order || 0) - (b.order || 0)
);

const dayGroups = sorted.reduce((acc, v) => {
    (acc[v.day] = acc[v.day] || []).push(v);
    return acc;
}, {});

const renderedDays = new Set();
[...dayOrder, ...Object.keys(dayGroups)].forEach(day => {
    if (!dayGroups[day] || renderedDays.has(day)) return;
    renderedDays.add(day);
    const section = document.createElement('section');
    section.className = 'day-section';
    const h2 = document.createElement('h2');
    h2.textContent = day;
    section.appendChild(h2);
    const grid = document.createElement('div');
    grid.className = 'video-grid';
    dayGroups[day].forEach(v => grid.appendChild(createVideoCard(v)));
    section.appendChild(grid);
    container.appendChild(section);
});

// Initialize videoCardMap after all cards are created
const videoCardMap = new Map();
videos.forEach(video => {
    if (videoElementMap[video.path]) {
        const card = window.videoCardMap.get(video.path);
        if (card) {
            videoCardMap.set(video.path, card);
        }
    }
});

// ─────────────────────────────────────────────────────────────────────
//  Background preload — staggered, so search works as soon as possible
// ─────────────────────────────────────────────────────────────────────
let preloadIdx = 0;
function preloadNext() {
    if (preloadIdx >= videos.length) return;
    const v = videos[preloadIdx++];
    if (!v.subtitle) { preloadNext(); return; }  // skip instantly if no subtitle
    loadTranscript(v).then(store => {
        // Eagerly attach VTT to all videos so captions are ready on play
        if (store.rawText && videoElementMap[v.path]) {
            attachVttTrack(videoElementMap[v.path], store.rawText);
        }
        setTimeout(preloadNext, 50);  // files are local — short stagger is enough
    });
}
setTimeout(preloadNext, 500);  // let the page paint first

// ─────────────────────────────────────────────────────────────────────
//  Throttled cross-video search
// ─────────────────────────────────────────────────────────────────────
const searchInput = document.getElementById('transcriptSearch');
const searchStatus = document.getElementById('searchStatus');
const searchResults = document.getElementById('searchResults');
const searchClear = document.getElementById('searchClear');
const searchToggleAll = document.getElementById('searchToggleAll');

let groupIdCounter = 0;
let allGroupsExpanded = true;
const MAX_RESULTS = 80;

function updateVideoCardDimState(activePaths) {
    for (const video of videos) {
        const card = videoCardMap.get(video.path);
        if (!card) continue;
        if (!activePaths || activePaths.has(video.path)) {
            card.classList.remove('dimmed');
        } else {
            card.classList.add('dimmed');
        }
    }
}

// Generation counter: incremented on every new search so stale async results are discarded
let searchGeneration = 0;

async function runSearch(query) {
    const generation = ++searchGeneration;

    searchResults.innerHTML = '';
    if (!query || query.length < 2) {
        searchStatus.textContent = query.length === 1 ? 'Type at least 2 characters…' : '';
        updateVideoCardDimState(null);
        return;
    }

    // Kick off (or reuse) loads for every video that has a subtitle file,
    // then wait for all of them so results are never partial.
    const pending = videos.filter(v => v.subtitle).map(v => loadTranscript(v));
    if (pending.length) {
        searchStatus.textContent = 'Loading transcripts…';
        await Promise.all(pending);
    }

    // A newer search was started while we were waiting — discard our results
    if (generation !== searchGeneration) return;

    const q = query.toLowerCase();
    const matches = [];

    for (const video of videos) {
        if (!video.subtitle) continue;
        const store = transcriptStore[video.path];
        if (!store || store.status !== 'ready') continue;
        const cues = store.cues;
        for (let cueIndex = 0; cueIndex < cues.length; cueIndex++) {
            const cue = cues[cueIndex];
            if (cue.text.toLowerCase().includes(q)) {
                matches.push({ video, cue, index: cueIndex });
                if (matches.length >= MAX_RESULTS) break;
            }
        }
        if (matches.length >= MAX_RESULTS) break;
    }

    if (!matches.length) {
        searchStatus.textContent = `No results for "${query}"`;
        updateVideoCardDimState(new Set());
        return;
    }

    const activePaths = new Set(matches.map(({ video }) => video.path));
    updateVideoCardDimState(activePaths);

    const truncated = matches.length >= MAX_RESULTS;
    searchStatus.textContent =
        `${truncated ? MAX_RESULTS + '+' : matches.length} result${matches.length !== 1 ? 's' : ''}`;

    const groupsByVideoPath = {};
    for (const { video, cue, index } of matches) {
        if (!groupsByVideoPath[video.path]) {
            groupsByVideoPath[video.path] = { video, cues: [] };
        }
        groupsByVideoPath[video.path].cues.push({ cue, index });
    }

    const frag = document.createDocumentFragment();

    // Render groups in order of first match
    for (const { video } of matches) {
        if (!groupsByVideoPath[video.path]) continue;
        const group = groupsByVideoPath[video.path];
        delete groupsByVideoPath[video.path];

        const groupEl = document.createElement('div');
        groupEl.className = 'search-result-group';
        groupEl.setAttribute('role', 'region');
        groupEl.setAttribute('aria-label', `Results for ${video.title}`);

        const groupIndex = ++groupIdCounter;
        const groupId = `search-result-group-items-${groupIndex}`;

        const titleEl = document.createElement('div');
        titleEl.className = 'search-result-group-title';

        const itemsContainer = document.createElement('div');
        itemsContainer.className = 'search-result-group-items';
        itemsContainer.id = groupId;
        itemsContainer.setAttribute('role', 'list');

        const toggleButton = document.createElement('button');
        toggleButton.className = 'search-result-group-toggle';
        toggleButton.type = 'button';
        toggleButton.setAttribute('aria-expanded', 'true');
        toggleButton.setAttribute('aria-controls', groupId);
        toggleButton.setAttribute('aria-label', `Toggle results for ${video.title}`);
        toggleButton.textContent = '▾';
        toggleButton.title = `Toggle results for ${video.title}`;

        const titleText = document.createElement('button');
        titleText.className = 'search-result-group-title-text';
        titleText.type = 'button';
        titleText.textContent = video.title;
        titleText.title = `View "${video.title}"`;

        const toggleGroup = () => {
            const hidden = !itemsContainer.hidden;
            itemsContainer.hidden = hidden;
            toggleButton.setAttribute('aria-expanded', String(!hidden));
        };

        titleEl.addEventListener('click', (e) => {
            e.preventDefault();
            toggleGroup();
        });

        toggleButton.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleGroup();
        });

        titleEl.appendChild(titleText);
        titleEl.appendChild(toggleButton);
        groupEl.appendChild(titleEl);

        for (const cueMatch of group.cues) {
            const item = document.createElement('div');
            item.className = 'search-result';
            item.setAttribute('role', 'listitem');
            item.setAttribute('tabindex', '0');
            item.title = `Jump to ${cueMatch.cue.startLabel}`;

            const timeEl = document.createElement('span');
            timeEl.className = 'search-result-time';
            timeEl.textContent = cueMatch.cue.startLabel;

            const textEl = document.createElement('div');
            textEl.className = 'search-result-text';
            const store = transcriptStore[video.path];
            textEl.innerHTML = store && store.cues
                ? createSearchResultContextHTML(store.cues, cueMatch.index, query)
                : highlightMatch(cueMatch.cue.text, query);

            item.appendChild(timeEl);
            item.appendChild(textEl);

            const activateSearchResult = () => {
                setAllCardsCondensed(false);
                openVideoModal(video, cueMatch.cue.start);
            };
            item.addEventListener('click', activateSearchResult);
            item.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); activateSearchResult(); }
            });

            itemsContainer.appendChild(item);
        }

        groupEl.appendChild(itemsContainer);
        frag.appendChild(groupEl);
    }

    searchResults.appendChild(frag);
    searchToggleAll.disabled = false;
    allGroupsExpanded = true;
}

let searchTimer = null;
searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    // Bump the generation immediately so any in-flight search is discarded
    searchGeneration++;
    searchTimer = setTimeout(() => runSearch(searchInput.value.trim()), 300);
});

searchToggleAll.addEventListener('click', () => {
    const groups = document.querySelectorAll('.search-result-group-toggle');
    allGroupsExpanded = !allGroupsExpanded;

    groups.forEach(toggle => {
        const items = toggle.closest('.search-result-group')?.querySelector('.search-result-group-items');
        if (items) {
            items.hidden = !allGroupsExpanded;
            toggle.setAttribute('aria-expanded', String(allGroupsExpanded));
        }
    });
});

searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchResults.innerHTML = '';
    searchStatus.textContent = '';
    updateVideoCardDimState(null);
    allGroupsExpanded = true;
    searchToggleAll.disabled = false;
    searchInput.focus();
});

// ─────────────────────────────────────────────────────────────────────
//  Top ten clips — short teaser fragments that open in the clip player
// ─────────────────────────────────────────────────────────────────────
function renderTopClips() {
    const row = document.getElementById('topClipsRow');
    if (!row) return;
    row.innerHTML = '';

    topClips.forEach((clip, index) => {
        const video = videos.find(v => v.title === clip.videoTitle);
        if (!video) return;

        const item = document.createElement('li');

        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'top-clip-card';
        card.setAttribute('aria-label',
            `Play clip ${index + 1}: ${clip.speaker} — ${clip.quote}`);

        const photo = document.createElement('img');
        photo.className = 'top-clip-photo';
        photo.src = getSpeakerPoster(video);
        photo.alt = '';
        photo.loading = 'lazy';
        photo.decoding = 'async';

        const scrim = document.createElement('div');
        scrim.className = 'top-clip-scrim';

        const rank = document.createElement('span');
        rank.className = 'top-clip-rank';
        rank.textContent = String(index + 1);
        rank.setAttribute('aria-hidden', 'true');

        const duration = document.createElement('span');
        duration.className = 'top-clip-duration';
        duration.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
        duration.appendChild(document.createTextNode(`${clip.end - clip.start}s`));

        const quote = document.createElement('p');
        quote.className = 'top-clip-quote';
        quote.textContent = `\u201C${clip.quote}\u201D`;

        const meta = document.createElement('div');
        meta.className = 'top-clip-meta';
        const speaker = document.createElement('span');
        speaker.className = 'top-clip-speaker';
        speaker.textContent = clip.speaker;
        const talk = document.createElement('span');
        talk.className = 'top-clip-talk';
        talk.textContent = clip.talk;
        meta.appendChild(speaker);
        meta.appendChild(talk);

        card.appendChild(photo);
        card.appendChild(scrim);
        card.appendChild(rank);
        card.appendChild(duration);
        card.appendChild(quote);
        card.appendChild(meta);

        card.addEventListener('click', () => {
            openVideoModal(video, clip.start, clip.end);
        });

        item.appendChild(card);
        row.appendChild(item);
    });

    const section = row.closest('.top-clips-section');
    if (section) section.hidden = row.children.length === 0;
}

renderTopClips();

// ─────────────────────────────────────────────────────────────────────
//  Handle URL hash for deep-linking to videos
// ─────────────────────────────────────────────────────────────────────
function handleHashChange() {
    const hash = window.location.hash;
    if (!hash) return;

    const hashPart = hash.substring(1);
    const ampIndex = hashPart.indexOf('&');
    const videoId = ampIndex === -1 ? hashPart : hashPart.substring(0, ampIndex);
    const queryStr = ampIndex === -1 ? '' : hashPart.substring(ampIndex + 1);
    const { start: timestamp, end: endTimestamp } = parseHashTimeRange(queryStr);
    const video = findVideoById(videoId);

    if (video?.subtitle) {
        openVideoModal(video, timestamp ?? 0, endTimestamp);
        return;
    }

    const videoCard = document.getElementById(videoId);

    if (videoCard) {
        videoCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        videoCard.classList.add('highlighted');

        if (timestamp !== null) {
            const videoEl = videoCard.querySelector('video');
            if (videoEl) {
                const seekCardVideo = () => {
                    videoEl.currentTime = timestamp;
                };
                if (videoEl.readyState >= 1) {
                    seekCardVideo();
                } else {
                    videoEl.addEventListener('loadedmetadata', seekCardVideo, { once: true });
                }

                if (endTimestamp !== null && endTimestamp > timestamp) {
                    const stopAtEnd = () => {
                        if (videoEl.currentTime >= endTimestamp) {
                            videoEl.pause();
                            videoEl.removeEventListener('timeupdate', stopAtEnd);
                        }
                    };
                    videoEl.addEventListener('timeupdate', stopAtEnd);
                }
            }
        }
    }
}

// Deep-link after cards exist. Do not wait for window "load" — bootGallery
// is async (site.json), so load has usually already fired by now and a
// late load listener would never run (hash URLs would show the gallery only).
handleHashChange();
window.addEventListener('hashchange', handleHashChange);

}

async function bootGallery() {
    const configUrl = window.GALLERY_CONFIG || 'site.json';
    const url = new URL(configUrl, window.location.href);
    const res = await fetch(url.href);
    if (!res.ok) {
        throw new Error(`Failed to load gallery config: ${url.href} (${res.status})`);
    }
    const config = await res.json();
    await initGallery(config);
}

bootGallery().catch((err) => {
    console.error(err);
    const header = document.getElementById('galleryHeader');
    if (header) {
        header.innerHTML = '<p class="status-notice">Could not load gallery configuration (site.json).</p>';
    }
});

})();
