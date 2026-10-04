#!/usr/bin/env node
/**
 * Build a designed PDF of transcripts from the `.srt` files in one event folder.
 *
 * Pipeline:
 *   1. Resolve an event directory from a slug (e.g. `2025-11-SEDI`)
 *   2. Recursively collect every `*.srt` file in that directory
 *   3. Parse SRT cues and group them into readable paragraphs
 *   4. Render an HTML document with a cover page, table of contents,
 *      and one chapter per talk
 *   5. Drive the locally installed Google Chrome (via puppeteer-core)
 *      to print the HTML to a paged PDF
 *
 * Usage:
 *   node scripts/build-transcript-pdf.js KERI/2026/apr [--open]
 *   node scripts/build-transcript-pdf.js SEDI/2025/nov [--open]
 *
 * Output:
 *   {ORG}-{YEAR}-{month}-Transcripts.pdf  (in the repo root; *.pdf is gitignored)
 */

import { readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFS_DIR = join(ROOT, "confs");

const BOM = "\uFEFF";
const TIMESTAMP_RE = /^(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/;
const CLIP_NAME_RE = /^(\d{2})-(\d{2})-(\d{2})--(\d{2})-(\d{2})-(\d{2})-(.+)$/;
const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

// ─── CLI ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith("-")));
  const positional = argv.filter((a) => !a.startsWith("-"));
  return {
    slug: positional[0] ?? "",
    openAfter: flags.has("--open"),
  };
}

function usage() {
  console.error("Usage: node scripts/build-transcript-pdf.js <ORG/YEAR/month> [--open]");
  console.error("Example: node scripts/build-transcript-pdf.js KERI/2026/apr");
}

// ─── Event directory ────────────────────────────────────────────────────────

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

async function findEventDir(slug) {
  const candidates = [
    resolve(slug),
    resolve(ROOT, slug),
    join(CONFS_DIR, slug),
  ];
  for (const candidate of candidates) {
    if (isDirectory(candidate)) return candidate;
  }

  throw new Error(
    `Could not find a conference directory "${slug}". Example: KERI/2026/apr (under ${CONFS_DIR}).`
  );
}

// ─── SRT collection ─────────────────────────────────────────────────────────

async function collectSrtFiles(eventDir) {
  const files = [];

  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (/\.srt$/i.test(entry.name)) {
        files.push(path);
      }
    }
  }

  await walk(eventDir);
  return files;
}

// ─── Event / PROGRAM.md metadata ────────────────────────────────────────────

const MONTHS = {
  jan: "January", feb: "February", mar: "March", apr: "April",
  may: "May", jun: "June", jul: "July", aug: "August",
  sep: "September", oct: "October", nov: "November", dec: "December",
};

function eventFromSlug(slug) {
  const conf = slug.match(/^([A-Za-z][A-Za-z0-9_-]*)\/(\d{4})\/([a-z]{3})$/i);
  if (conf) {
    const org = conf[1];
    const year = conf[2];
    const month = MONTHS[conf[3].toLowerCase()] || conf[3];
    return { slug, year, shortName: org, name: `${org} ${month} ${year}`, date: "" };
  }
  const match = slug.match(/^(\d{4})(?:-(\d{2}))?-([A-Za-z0-9][A-Za-z0-9-]*)$/);
  if (!match) {
    return { slug, year: "", shortName: slug, name: slug, date: "" };
  }
  const year = match[1];
  const shortName = match[3].replace(/-/g, " ");
  return { slug, year, shortName, name: `${shortName} ${year}`, date: "" };
}

function splitSpeakerAffiliation(speakerCell) {
  if (speakerCell.includes(";")) {
    return { speaker: speakerCell, affiliation: "" };
  }

  let depth = 0;
  let comma = -1;
  for (let i = 0; i < speakerCell.length; i++) {
    const ch = speakerCell[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) {
      comma = i;
      break;
    }
  }

  let speaker = speakerCell;
  let affiliation = "";
  if (comma !== -1) {
    speaker = speakerCell.slice(0, comma).trim();
    affiliation = speakerCell.slice(comma + 1).trim();
  } else {
    const paren = speakerCell.match(/^(.+?)\s*\((.+)\)\s*$/);
    if (paren) {
      speaker = paren[1].trim();
      affiliation = paren[2].trim();
    }
  }
  return { speaker, affiliation };
}

function parseProgram(text) {
  const eventName = text.match(/\*\*Event:\*\*\s*(.+)/)?.[1]?.trim() ?? "";
  const date = text.match(/\*\*Date:\*\*\s*(.+)/)?.[1]?.trim() ?? "";
  const byStem = new Map();

  for (const line of text.split(/\r?\n/)) {
    const row = line.match(/\|\s*`([^`]+)`\s*\|\s*([^|]+)\|/);
    if (!row) continue;
    const stem = basename(row[1]).replace(/\.(mp4|srt)$/i, "");
    const speakerCell = row[2].trim();
    if (!stem || !speakerCell || speakerCell === "Speaker") continue;

    const { speaker, affiliation } = splitSpeakerAffiliation(speakerCell);
    byStem.set(stem, { speaker, affiliation, speakerCell });
  }

  return { eventName, date, byStem };
}

async function loadEventMeta(eventDir, slug) {
  const event = eventFromSlug(slug);
  const programPath = join(eventDir, "PROGRAM.md");
  if (!existsSync(programPath)) return { ...event, byStem: new Map() };

  const program = parseProgram(await readFile(programPath, "utf8"));
  if (program.eventName) event.name = program.eventName;
  if (program.date) event.date = program.date;

  const acronym = program.eventName.match(/\(([A-Z][A-Z0-9]+)\)/)?.[1];
  if (acronym) {
    const after = program.eventName.replace(/.*\)\s*/, "").trim();
    event.shortName = after ? `${acronym} ${after}` : acronym;
  }

  return { ...event, byStem: program.byStem };
}

function coverTitleParts(event) {
  const acronym = event.name.match(/\(([A-Z][A-Z0-9]+)\)/)?.[1];
  if (acronym) {
    const after = event.name.replace(/.*\)\s*/, "").trim();
    return { line1: acronym, line2: after || "Transcripts", accent: event.year };
  }
  const words = (event.shortName || event.name).split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return {
      line1: words[0],
      line2: words.slice(1).join(" "),
      accent: event.year,
    };
  }
  return { line1: event.shortName || event.slug, line2: "Transcripts", accent: event.year };
}

// ─── SRT parsing ────────────────────────────────────────────────────────────

function parseSrt(text) {
  const stripped = text.startsWith(BOM) ? text.slice(1) : text;
  return stripped
    .split(/\r?\n\r?\n/)
    .map((block) => block.split(/\r?\n/))
    .map((lines) => {
      const tsIdx = lines.findIndex((l) => TIMESTAMP_RE.test(l));
      if (tsIdx === -1) return null;
      const match = lines[tsIdx].match(TIMESTAMP_RE);
      const content = lines
        .slice(tsIdx + 1)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      return {
        start: toSeconds(match[1]),
        end: toSeconds(match[2]),
        text: content,
      };
    })
    .filter(Boolean);
}

function toSeconds(ts) {
  const [h, m, rest] = ts.split(":");
  const [s, ms] = rest.split(",");
  return +h * 3600 + +m * 60 + +s + +ms / 1000;
}

function formatTimestamp(seconds) {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// ─── Filename → metadata ────────────────────────────────────────────────────

const SEP = "｜"; // fullwidth vertical line used in conference filenames

function stripSrtExtension(filename) {
  return filename.replace(/\.srt$/i, "");
}

function sessionFromPath(filePath, eventDir) {
  const rel = relative(eventDir, dirname(filePath));
  const parts = rel.split(sep).filter((p) => p && p !== "." && p !== "speakers");
  if (!parts.length) return "";
  const sessionDir = parts[0];
  const known = sessionDir.match(/(Morning[- ]Session|Lunch[- ]Panel|Afternoon[- ]Session)$/i);
  if (known) return known[1].replace(/-/g, " ");
  return sessionDir.replace(/-/g, " ");
}

function sessionRank(session) {
  const value = (session || "").toLowerCase();
  if (value.includes("morning")) return 0;
  if (value.includes("lunch")) return 1;
  if (value.includes("afternoon")) return 2;
  return 10;
}

function parseConferenceFilename(filename) {
  const base = stripSrtExtension(filename);
  let core = base;
  const tagRe = /\s*[｜|]\s*KERI\s*Conf(?:erence)?\s*\d{4}\s*$/i;
  const tagMatch = base.match(tagRe);
  if (tagMatch) core = base.slice(0, tagMatch.index);

  const parts = core.split(SEP).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { speaker: parts[0], title: parts.slice(1).join(` ${SEP} `).trim() };
  }
  return { speaker: "", title: core.trim() };
}

function parseClipFilename(filename) {
  const base = stripSrtExtension(filename);
  const match = base.match(CLIP_NAME_RE);
  if (!match) return null;
  return {
    startKey: `${match[1]}${match[2]}${match[3]}`,
    speaker: match[7].replace(/-/g, " ").trim(),
  };
}

function parseTalkMeta(filePath, eventDir, byStem) {
  const filename = basename(filePath);
  const stem = stripSrtExtension(filename);
  const session = sessionFromPath(filePath, eventDir);
  const clip = parseClipFilename(filename);
  const program = byStem.get(stem);

  if (clip) {
    let speaker = clip.speaker;
    let affiliation = "";
    if (program) {
      if (program.speaker.length <= 40) speaker = program.speaker;
      affiliation =
        program.affiliation ||
        (program.speaker.length > 40 ? program.speakerCell : "");
    }
    return {
      speaker,
      title: session || speaker,
      affiliation,
      session,
      startKey: clip.startKey,
      style: "clip",
    };
  }

  const conference = parseConferenceFilename(filename);
  return {
    speaker: conference.speaker,
    title: conference.title,
    affiliation: "",
    session,
    startKey: "",
    style: "conference",
  };
}

function sortTalks(talks) {
  return talks.sort((a, b) => {
    const session = sessionRank(a.session) - sessionRank(b.session);
    if (session) return session;
    if (a.startKey && b.startKey && a.startKey !== b.startKey) {
      return a.startKey.localeCompare(b.startKey);
    }
    return a.filename.localeCompare(b.filename, "en", { sensitivity: "base" });
  });
}

// ─── Cue → paragraph grouping ───────────────────────────────────────────────

const SENTENCE_END = /[.!?]["'”’)\]]?$/;
const SENTENCE_BOUNDARY = /[.!?]["'”’)\]]?(?:\s|$)/g;
const FILLER = /^\s*[\[(](?:inaudible|applause|laughter|music|silence|indistinct|cross ?talk)[^\])]*[\])]\s*$/i;

function countSentences(text) {
  const matches = text.match(SENTENCE_BOUNDARY);
  return matches ? matches.length : 0;
}

function groupIntoParagraphs(cues) {
  const cleaned = cues
    .filter((c, i) => !(i === 0 && c.text.length > 0 && c.end - c.start < 4))
    .filter((c) => c.text.length > 0)
    .filter((c) => !FILLER.test(c.text));

  const paragraphs = [];
  let current = null;

  const flush = () => {
    if (current && current.text.trim()) {
      current.text = current.text.replace(/\s+/g, " ").trim();
      paragraphs.push(current);
    }
    current = null;
  };

  for (const cue of cleaned) {
    if (!current) {
      current = { start: cue.start, end: cue.end, text: cue.text, sentences: countSentences(cue.text) };
      continue;
    }

    const gap = cue.start - current.end;
    current.end = cue.end;

    const endsSentence = SENTENCE_END.test(current.text);
    const sentenceCount = current.sentences;
    const longEnough = current.text.length >= 220;

    if ((endsSentence && sentenceCount >= 2 && longEnough) || gap > 12) {
      flush();
      current = { start: cue.start, end: cue.end, text: cue.text, sentences: countSentences(cue.text) };
    } else {
      const needsSpace = !current.text.endsWith(" ") && !cue.text.startsWith(" ");
      current.text += (needsSpace ? " " : "") + cue.text;
      current.sentences += countSentences(cue.text);
    }
  }
  flush();

  return paragraphs;
}

// ─── HTML escaping ──────────────────────────────────────────────────────────

function esc(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cssStr(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

const romanNumerals = [
  "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
  "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX",
  "XXI", "XXII", "XXIII", "XXIV", "XXV", "XXVI", "XXVII", "XXVIII", "XXIX", "XXX",
];
function toRoman(n) {
  return romanNumerals[n - 1] ?? String(n);
}

function initialOf(speaker) {
  const parts = speaker.split(/\s+/).filter(Boolean);
  return parts.length ? parts[0][0].toUpperCase() : "•";
}

function chapterHeading(talk) {
  if (talk.style === "conference" && talk.title) {
    return { title: talk.title, speaker: talk.speaker };
  }
  return {
    title: talk.speaker || talk.title,
    speaker: talk.affiliation || talk.session,
  };
}

function chapterMeta(talk, event) {
  const parts = [event.shortName || event.name];
  if (talk.session) parts.push(talk.session);
  parts.push(formatTimestamp(talk.duration));
  return parts.filter(Boolean).join(" · ");
}

// ─── HTML assembly ──────────────────────────────────────────────────────────

function buildHtml(talks, generatedOn, event) {
  const cover = coverTitleParts(event);
  const footerLabel = event.shortName || event.name;
  const coverMark = [cover.line1, event.year].filter(Boolean).join(" · ");
  const coverSub = event.date
    ? `A complete transcript of every recorded talk from the ${event.name} — ${event.date}.`
    : `A complete transcript of every recorded talk from the ${event.name}.`;

  const talkRows = talks
    .map((t, i) => {
      const num = String(i + 1).padStart(2, "0");
      const tocTitle = t.style === "conference" ? t.title : t.session || t.title;
      return `
        <a class="toc-row" href="#talk-${i}">
          <span class="toc-num">${num}</span>
          <span class="toc-speaker">${esc(t.speaker || t.title)}</span>
          <span class="toc-title">${esc(tocTitle)}</span>
          <span class="toc-dots"></span>
          <span class="toc-page-no">${formatTimestamp(t.duration)}</span>
        </a>`;
    })
    .join("");

  const chapters = talks
    .map((t, i) => {
      const paragraphs = t.paragraphs
        .map((p) => `<p>${esc(p.text)}</p>`)
        .join("\n");
      const heading = chapterHeading(t);

      return `
      <section class="chapter">
        <div class="chapter-opener">
          <div class="chapter-opener-inner">
            <div class="chapter-mark">Talk ${toRoman(i + 1)}</div>
            <div class="chapter-initial">${esc(initialOf(t.speaker || heading.title))}</div>
            <h1 class="chapter-title">${esc(heading.title)}</h1>
            <div class="chapter-speaker">${esc(heading.speaker)}</div>
            <div class="chapter-meta">${esc(chapterMeta(t, event))}</div>
          </div>
        </div>
        <div class="transcript" id="talk-${i}">
          ${paragraphs}
        </div>
      </section>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(event.name)} — Transcripts</title>
<style>
  @page {
    size: A4;
    margin: 22mm 18mm 20mm 18mm;
    @bottom-left {
      content: "${cssStr(footerLabel)}";
      font-family: "Iowan Old Style", "Palatino", Georgia, serif;
      font-size: 8.5pt;
      color: #8a8f98;
    }
    @bottom-right {
      content: counter(page);
      font-family: "Iowan Old Style", "Palatino", Georgia, serif;
      font-size: 8.5pt;
      color: #8a8f98;
    }
  }
  @page cover { margin: 0; @bottom-left { content: ""; } @bottom-right { content: ""; } }
  @page opener { margin: 0; @bottom-left { content: ""; } @bottom-right { content: ""; } }
  @page toc { @bottom-right { content: counter(page); } }

  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    margin: 0;
    font-family: "Iowan Old Style", "Palatino", "Palatino Linotype", Georgia, serif;
    color: #1b1f24;
    font-size: 10.5pt;
    line-height: 1.55;
    text-rendering: optimizeLegibility;
  }

  /* ─── Cover ─── */
  .cover {
    page: cover;
    page-break-after: always;
    position: relative;
    height: 297mm;
    box-sizing: border-box;
    padding: 0;
    background:
      radial-gradient(120% 80% at 85% 8%, rgba(120, 190, 255, 0.18), transparent 60%),
      radial-gradient(90% 70% at 10% 95%, rgba(255, 180, 120, 0.10), transparent 55%),
      linear-gradient(160deg, #0b1f3a 0%, #112a52 45%, #0a1730 100%);
    color: #f4f6fb;
    overflow: hidden;
  }
  .cover::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px);
    background-size: 28mm 28mm;
    pointer-events: none;
  }
  .cover-inner {
    position: relative;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 28mm 22mm;
  }
  .cover-top { display: flex; justify-content: space-between; align-items: flex-start; }
  .cover-mark {
    font-family: "SF Mono", "Menlo", monospace;
    font-size: 9pt;
    letter-spacing: 0.32em;
    text-transform: uppercase;
    color: #7fb6ff;
  }
  .cover-glyph {
    width: 14mm; height: 14mm;
    border: 1.5px solid rgba(255,255,255,0.45);
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-family: "Iowan Old Style", Georgia, serif;
    font-size: 16pt; font-style: italic; color: #fff;
  }
  .cover-center { margin-top: -8mm; }
  .cover-eyebrow {
    font-family: "SF Mono", "Menlo", monospace;
    font-size: 10pt;
    letter-spacing: 0.4em;
    text-transform: uppercase;
    color: #9fc7ff;
    margin-bottom: 14mm;
  }
  .cover-title {
    font-family: "Iowan Old Style", "Palatino", Georgia, serif;
    font-weight: 700;
    font-size: 64pt;
    line-height: 1.02;
    letter-spacing: -0.01em;
    margin: 0;
  }
  .cover-title .accent { color: #7fb6ff; font-style: italic; font-weight: 400; }
  .cover-sub {
    margin-top: 10mm;
    font-size: 16pt;
    font-style: italic;
    color: #c9d6ee;
    max-width: 130mm;
    line-height: 1.4;
  }
  .cover-rule {
    margin-top: 14mm;
    width: 60mm;
    height: 1px;
    background: linear-gradient(90deg, #7fb6ff, transparent);
  }
  .cover-bottom {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    font-family: "SF Mono", "Menlo", monospace;
    font-size: 9pt;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #aab9d6;
  }
  .cover-bottom .stats { display: flex; gap: 14mm; }
  .cover-bottom .stat-num {
    display: block;
    font-family: "Iowan Old Style", Georgia, serif;
    font-size: 22pt;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: none;
    color: #fff;
    margin-bottom: 2mm;
  }

  /* ─── Table of contents ─── */
  .toc-page { page: toc; page-break-after: always; }
  .toc-heading {
    font-family: "Iowan Old Style", Georgia, serif;
    font-size: 30pt;
    font-weight: 700;
    letter-spacing: -0.01em;
    margin: 0 0 2mm 0;
  }
  .toc-lede {
    font-style: italic;
    color: #5a6270;
    margin: 0 0 10mm 0;
    font-size: 11pt;
  }
  .toc-list { display: flex; flex-direction: column; }
  .toc-row {
    display: grid;
    grid-template-columns: 10mm 38mm 1fr auto;
    align-items: baseline;
    gap: 3mm;
    padding: 2.2mm 0;
    border-bottom: 0.5px solid #e4e7ec;
    text-decoration: none;
    color: inherit;
  }
  .toc-num {
    font-family: "SF Mono", "Menlo", monospace;
    font-size: 9pt;
    color: #9aa3b0;
  }
  .toc-speaker {
    font-weight: 700;
    font-size: 10.5pt;
  }
  .toc-title {
    font-style: italic;
    color: #444b56;
    font-size: 10.5pt;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .toc-dots { display: none; }
  .toc-page-no {
    font-family: "SF Mono", "Menlo", monospace;
    font-size: 9pt;
    color: #9aa3b0;
    text-align: right;
    min-width: 16mm;
  }

  /* ─── Chapter opener ─── */
  .chapter { page-break-before: always; }
  .chapter-opener {
    page: opener;
    page-break-after: always;
    height: 257mm;
    box-sizing: border-box;
    background: linear-gradient(165deg, #0b1f3a 0%, #112a52 100%);
    color: #f4f6fb;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
  }
  .chapter-opener::before {
    content: "";
    position: absolute; inset: 0;
    background-image:
      linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px);
    background-size: 24mm 24mm;
  }
  .chapter-opener-inner {
    position: relative;
    text-align: center;
    padding: 0 30mm;
  }
  .chapter-mark {
    font-family: "SF Mono", "Menlo", monospace;
    font-size: 10pt;
    letter-spacing: 0.4em;
    text-transform: uppercase;
    color: #7fb6ff;
    margin-bottom: 18mm;
  }
  .chapter-initial {
    width: 26mm; height: 26mm;
    margin: 0 auto 14mm;
    border: 1.5px solid rgba(255,255,255,0.5);
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-family: "Iowan Old Style", Georgia, serif;
    font-style: italic;
    font-size: 30pt;
    color: #fff;
  }
  .chapter-title {
    font-family: "Iowan Old Style", Georgia, serif;
    font-weight: 700;
    font-size: 30pt;
    line-height: 1.15;
    letter-spacing: -0.01em;
    margin: 0 auto 10mm;
    max-width: 150mm;
  }
  .chapter-speaker {
    font-size: 15pt;
    font-style: italic;
    color: #c9d6ee;
    margin-bottom: 6mm;
  }
  .chapter-meta {
    font-family: "SF Mono", "Menlo", monospace;
    font-size: 9pt;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #9fc7ff;
  }

  /* ─── Transcript body ─── */
  .transcript { columns: 1; }
  .transcript p {
    margin: 0 0 2.4mm 0;
    text-indent: 6mm;
    orphans: 3;
    widows: 3;
    text-align: justify;
    hyphens: auto;
  }
  .transcript p:first-child { text-indent: 0; }

  /* First paragraph after opener: drop cap */
  .transcript p:first-child::first-letter {
    font-family: "Iowan Old Style", Georgia, serif;
    font-size: 32pt;
    font-weight: 700;
    float: left;
    line-height: 0.9;
    padding: 1.5mm 2mm 0 0;
    color: #0b1f3a;
  }
</style>
</head>
<body>

  <div class="cover">
    <div class="cover-inner">
      <div class="cover-top">
        <div class="cover-mark">${esc(coverMark)}</div>
        <div class="cover-glyph">${esc((cover.line1 || "T")[0])}</div>
      </div>
      <div class="cover-center">
        <div class="cover-eyebrow">Transcripts</div>
        <h1 class="cover-title">${esc(cover.line1)}<br>${esc(cover.line2)}${
          cover.accent ? `<br><span class="accent">${esc(cover.accent)}</span>` : ""
        }</h1>
        <div class="cover-sub">${esc(coverSub)}</div>
        <div class="cover-rule"></div>
      </div>
      <div class="cover-bottom">
        <div class="stats">
          <div><span class="stat-num">${talks.length}</span>Talks</div>
          <div><span class="stat-num">${formatTimestamp(
            talks.reduce((a, t) => a + t.duration, 0)
          )}</span>Runtime</div>
        </div>
        <div>${esc(generatedOn)}</div>
      </div>
    </div>
  </div>

  <div class="toc-page">
    <h2 class="toc-heading">Contents</h2>
    <p class="toc-lede">Full transcripts of all ${talks.length} recorded sessions, in the order they appear in the archive.</p>
    <div class="toc-list">${talkRows}</div>
  </div>

  ${chapters}

</body>
</html>`;
}

// ─── Chrome discovery ───────────────────────────────────────────────────────

function findChrome() {
  for (const p of CHROME_CANDIDATES) {
    if (existsSync(p)) return p;
  }
  throw new Error(
    "Could not find Google Chrome / Chromium / Edge. Install Chrome or add its path to CHROME_CANDIDATES."
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const { slug, openAfter } = parseArgs(process.argv.slice(2));
  if (!slug) {
    usage();
    process.exit(1);
  }

  const eventDir = await findEventDir(slug);
  const event = await loadEventMeta(eventDir, slug);
  const outputPath = join(ROOT, `${slug.replace(/[\\/]+/g, "-")}-Transcripts.pdf`);

  const srtFiles = await collectSrtFiles(eventDir);
  if (srtFiles.length === 0) {
    console.error("No .srt files found in", eventDir);
    process.exit(1);
  }

  console.log(`Event: ${event.name}`);
  console.log(`Source: ${eventDir}`);
  console.log(`Found ${srtFiles.length} transcript files.`);

  const talks = [];
  for (const path of srtFiles) {
    const filename = basename(path);
    const raw = await readFile(path, "utf8");
    const cues = parseSrt(raw);
    const meta = parseTalkMeta(path, eventDir, event.byStem);
    const paragraphs = groupIntoParagraphs(cues);
    const duration = cues.length ? cues[cues.length - 1].end : 0;
    talks.push({ filename, paragraphs, duration, ...meta });
  }

  sortTalks(talks);

  for (const talk of talks) {
    const label = (talk.speaker || talk.title).padEnd(28);
    const subtitle = (talk.session || talk.title).slice(0, 50).padEnd(50);
    console.log(`  · ${label} ${subtitle} ${formatTimestamp(talk.duration)}`);
  }

  const generatedOn = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  const html = buildHtml(talks, generatedOn, event);
  const htmlPath = join(ROOT, ".transcripts-build.html");
  await writeFile(htmlPath, html, "utf8");
  console.log(`Wrote intermediate HTML: ${htmlPath}`);

  console.log("Launching Chrome to render PDF…");
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: "new",
    userDataDir: join(ROOT, ".chrome-profile"),
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle0" });
    await page.emulateMediaType("print");
    await page.pdf({
      path: outputPath,
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
  } finally {
    await browser.close();
  }

  console.log(`\n✓ PDF written: ${outputPath}`);
  if (openAfter) {
    const { exec } = await import("node:child_process");
    exec(`open "${outputPath}"`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
