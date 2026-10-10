#!/usr/bin/env node
/**
 * Find Whisper repetition loops in SRT files and optionally remove them.
 *
 * Whisper sometimes locks onto one word ("rules rules rules…") or a short
 * phrase ("they have perfectly excellent" over and over) and pastes it onto
 * the end of a cue, the start of a cue, or into a run of following cues.
 * Those following cues often have a zero-length timestamp.
 *
 * Only .srt files are read. Each contiguous run is one episode. Answering
 * yes strips the loop and keeps any real words in the same cue. A cue that
 * is only the loop is deleted, and cue numbers are rewritten.
 *
 *   node scripts/detect-nonsense-subtitles.js confs/KERI/2026/apr/interviews
 *   node scripts/detect-nonsense-subtitles.js --report confs
 *   node scripts/detect-nonsense-subtitles.js --yes path/to/file.srt
 *
 * Prompts: y remove, n leave, a remove this and everything after it, q save and stop.
 */

import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { stdin as input, stdout as output } from "node:process";

const TIMESTAMP_RE =
  /^(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/;
const TOKEN_RE = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;
const BOM = "\uFEFF";

// A single word repeated this many times is a loop ("rules" × 5).
// People do say "no no no"; they almost never say one word five times.
const MIN_WORD_REPEATS = 5;
// A 2–8 word phrase repeated this many times, covering at least MIN_PHRASE_TOKENS.
// Two cycles in a normal-length cue is someone repeating a clause ("we need to
// we need to"). Whisper's phrase loops land in near-zero timestamp cues, or
// they run for many cycles.
const MIN_PHRASE_REPEATS = 2;
const MIN_PHRASE_TOKENS = 6;
const MAX_PHRASE_LEN = 8;
const PHRASE_LOOP_MAX_DURATION_MS = 1000;
const PHRASE_LOOP_ALWAYS_CYCLES = 4;

// Words that may sit inside a loop without being the loop itself ("a" in
// "they have a perfectly excellent").
const FILLERS = new Set(["a", "an", "the", "of", "to", "and", "or", "um", "uh"]);

// Truncated leftovers ("nic" after "nicotine") that are also ordinary words.
const STUB_STOP = new Set([
  "the", "and", "for", "you", "that", "this", "with", "have", "they", "from",
  "not", "are", "was", "but", "can", "all", "her", "his", "our", "out", "one",
  "had", "has", "its", "let", "who", "how", "why", "what", "when", "your",
  "just", "like", "than", "then", "them", "been", "will", "into", "over",
  "also", "more", "some", "such", "only", "very", "most", "many", "much",
]);

const SKIP_DIRS = new Set([".git", "node_modules", ".history"]);

function tokenize(text) {
  const tokens = [];
  for (const match of text.matchAll(TOKEN_RE)) {
    tokens.push({
      word: match[0],
      lower: match[0].toLowerCase(),
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return tokens;
}

function tsToMs(stamp) {
  const match = /^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/.exec(stamp);
  if (!match) return null;
  return (
    ((Number(match[1]) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000 +
    Number(match[4])
  );
}

function samePhrase(tokens, i, j, len) {
  for (let k = 0; k < len; k += 1) {
    if (tokens[i + k].lower !== tokens[j + k].lower) return false;
  }
  return true;
}

/** Shortest phrase that tiles [start, end), including a partial final cycle. */
function phraseUnit(tokens, start, end) {
  const slice = tokens.slice(start, end);
  const n = slice.length;
  const maxLen = Math.min(MAX_PHRASE_LEN, Math.floor(n / 2));

  for (let len = 1; len <= maxLen; len += 1) {
    const minReps = len === 1 ? MIN_WORD_REPEATS : MIN_PHRASE_REPEATS;
    let reps = 0;
    let ok = true;
    for (let i = 0; i + len <= n; i += len) {
      for (let k = 0; k < len; k += 1) {
        if (slice[i + k].lower !== slice[k].lower) {
          ok = false;
          break;
        }
      }
      if (!ok) break;
      reps += 1;
    }
    if (!ok || reps < minReps) continue;
    const rem = n % len;
    for (let k = 0; k < rem; k += 1) {
      if (slice[n - rem + k].lower !== slice[k].lower) {
        ok = false;
        break;
      }
    }
    if (ok) return slice.slice(0, len).map((token) => token.word);
  }

  return [slice[0].word];
}

function findRepeatSpans(tokens, minLen, maxLenLimit) {
  const n = tokens.length;
  const covered = new Array(n).fill(false);
  const spans = [];
  const maxLen = Math.min(maxLenLimit, Math.floor(n / MIN_PHRASE_REPEATS));

  for (let len = maxLen; len >= minLen; len -= 1) {
    const minReps = len === 1 ? MIN_WORD_REPEATS : MIN_PHRASE_REPEATS;
    const minTokens = len === 1 ? MIN_WORD_REPEATS : Math.max(MIN_PHRASE_TOKENS, len * minReps);
    let i = 0;
    while (i <= n - minTokens) {
      if (covered[i]) {
        i += 1;
        continue;
      }
      let reps = 1;
      let j = i + len;
      while (
        j + len <= n &&
        !covered.slice(j, j + len).some(Boolean) &&
        samePhrase(tokens, i, j, len)
      ) {
        reps += 1;
        j += len;
      }
      if (reps >= minReps) {
        let extra = 0;
        while (
          extra < len &&
          j + extra < n &&
          !covered[j + extra] &&
          tokens[j + extra].lower === tokens[i + extra].lower
        ) {
          extra += 1;
        }
        const end = j + extra;
        if (end - i >= minTokens) {
          const label = phraseUnit(tokens, i, end).join(" ");
          spans.push({ start: i, end, label });
          for (let k = i; k < end; k += 1) covered[k] = true;
          i = end;
          continue;
        }
      }
      i += 1;
    }
  }

  return spans.sort((a, b) => a.start - b.start);
}

/** Phrase loops in a normal-length cue are almost always real speech said twice. */
function phraseSpanAllowed(span, durationMs) {
  const words = span.label.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return true;
  const cycles = (span.end - span.start) / words.length;
  if (cycles >= PHRASE_LOOP_ALWAYS_CYCLES) return true;
  return durationMs !== null && durationMs >= 0 && durationMs <= PHRASE_LOOP_MAX_DURATION_MS;
}

function spanCovers(spans, index) {
  return spans.some((span) => index >= span.start && index < span.end);
}

function mergeSpans(spans) {
  const sorted = [...spans].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const span of sorted) {
    const prev = merged.at(-1);
    if (!prev || span.start > prev.end) {
      merged.push({ ...span });
      continue;
    }
    prev.end = Math.max(prev.end, span.end);
    if (span.label && !prev.label.split(" / ").includes(span.label)) {
      prev.label = `${prev.label} / ${span.label}`;
    }
  }
  return merged;
}

/** "nic" glued onto "nicotine", and a stray letter after a full stop. */
function absorbStubs(text, tokens, spans) {
  const extra = [];
  for (const span of spans) {
    const word = tokens[span.start].lower;
    if (span.end < tokens.length && !spanCovers(spans, span.end)) {
      const next = tokens[span.end].lower;
      if (
        next.length >= 3 &&
        next.length < word.length &&
        word.startsWith(next) &&
        !STUB_STOP.has(next)
      ) {
        extra.push({ start: span.end, end: span.end + 1, label: span.label });
      }
    }
    if (span.start > 0 && span.end === tokens.length && !spanCovers(spans, span.start - 1)) {
      const prev = tokens[span.start - 1];
      const before = text.slice(0, prev.start);
      if (
        prev.lower.length === 1 &&
        !/^[ai]$/i.test(prev.lower) &&
        /[.!?]["')\]]*\s*$/.test(before)
      ) {
        extra.push({ start: span.start - 1, end: span.start, label: span.label });
      }
    }
  }
  return extra.length ? mergeSpans([...spans, ...extra]) : spans;
}

/** One or two leftover copies of the loop word sitting against a span. */
function absorbResiduals(tokens, spans) {
  if (!spans.length) return spans;
  const words = new Set();
  for (const span of spans) {
    for (const word of span.label.toLowerCase().split(/\s*\/\s*|\s+/)) {
      if (word) words.add(word);
    }
  }
  const covered = new Array(tokens.length).fill(false);
  for (const span of spans) {
    for (let i = span.start; i < span.end; i += 1) covered[i] = true;
  }
  const extra = [];
  let i = 0;
  while (i < tokens.length) {
    if (covered[i]) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < tokens.length && !covered[j]) j += 1;
    const adjacent = (i > 0 && covered[i - 1]) || (j < tokens.length && covered[j]);
    const onlyLoop = tokens.slice(i, j).every((token) => words.has(token.lower));
    if (adjacent && onlyLoop && j - i <= 2) {
      extra.push({ start: i, end: j, label: spans[0].label });
    }
    i = j;
  }
  return extra.length ? mergeSpans([...spans, ...extra]) : spans;
}

function applyTokenSpans(text, tokens, spans) {
  if (!spans.length) return text;
  const ranges = spans.map((span) => [tokens[span.start].start, tokens[span.end - 1].end]);
  let out = "";
  let cursor = 0;
  for (const [start, end] of ranges) {
    out += text.slice(cursor, start);
    cursor = end;
  }
  out += text.slice(cursor);
  return out
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trim())
    .filter((line) => /[\p{L}\p{N}]/u.test(line))
    .join("\n");
}

function whereLabel(tokenCount, spans) {
  if (!spans.length || tokenCount === 0) return "";
  let covered = 0;
  let touchesStart = false;
  let touchesEnd = false;
  for (const span of spans) {
    covered += span.end - span.start;
    if (span.start === 0) touchesStart = true;
    if (span.end === tokenCount) touchesEnd = true;
  }
  if (covered >= tokenCount) return "whole cue";
  if (touchesStart && touchesEnd) return "start and end";
  if (touchesEnd) return "end";
  if (touchesStart) return "start";
  return "middle";
}

function refreshCue(cue) {
  cue.spans = mergeSpans(cue.spans);
  const covered = new Set();
  for (const span of cue.spans) {
    for (let i = span.start; i < span.end; i += 1) covered.add(i);
  }
  cue.loopTokenRatio = cue.tokens.length ? covered.size / cue.tokens.length : 0;
  cue.cleaned = applyTokenSpans(cue.body, cue.tokens, cue.spans);
  cue.drop = cue.spans.length > 0 && cue.cleaned === "";
  cue.where = whereLabel(cue.tokens.length, cue.spans);
  cue.loopNames = [
    ...new Set(cue.spans.flatMap((span) => span.label.split(/\s*\/\s*/).filter(Boolean))),
  ];
}

/**
 * How many tokens at the start (or end) equal `phrase` repeated, trying
 * every rotation so a cue can begin mid-phrase.
 */
function alignedRun(tokens, phrase, fromEnd) {
  const unit = phrase.map((word) => word.toLowerCase());
  if (!unit.length || !tokens.length) return 0;
  let best = 0;
  for (let rot = 0; rot < unit.length; rot += 1) {
    const rotated = unit.slice(rot).concat(unit.slice(0, rot));
    let matched = 0;
    if (!fromEnd) {
      for (let i = 0; i < tokens.length; i += 1) {
        if (tokens[i].lower !== rotated[i % rotated.length]) break;
        matched += 1;
      }
    } else {
      for (let k = 1; k <= tokens.length; k += 1) {
        const idx = rotated.length - ((k - 1) % rotated.length) - 1;
        if (tokens[tokens.length - k].lower !== rotated[idx]) break;
        matched += 1;
      }
    }
    if (matched > best) best = matched;
  }
  return best;
}

function phraseWords(label) {
  return label.split(/\s+/).filter(Boolean);
}

function runThreshold(phrase) {
  return phrase.length === 1 ? 3 : Math.max(phrase.length, 3);
}

/**
 * Once a cue is clearly a loop, the cue before it often still has the start
 * of that loop after the last real sentence, and the cue after it often has
 * a few leftover copies before real speech resumes.
 */
function extendFromSources(cues) {
  const isSource = (cue) =>
    cue.pass1 && (cue.drop || cue.loopTokenRatio >= 0.5) && cue.loopNames.length > 0;

  let grew = true;
  let guard = 0;
  while (grew && guard < cues.length + 1) {
    grew = false;
    guard += 1;
    for (let index = 0; index < cues.length; index += 1) {
      const cue = cues[index];
      if (!isSource(cue)) continue;
      const labels = cue.loopNames;
      if (index > 0) grew = attachSuffix(cues[index - 1], labels) || grew;
      if (index + 1 < cues.length) grew = attachPrefix(cues[index + 1], labels) || grew;
    }
  }
}

function attachSuffix(cue, labels) {
  if (cue.kind !== "cue" || cue.drop || !cue.tokens.length) return false;
  const additions = [];
  for (const label of labels) {
    const phrase = phraseWords(label);
    const phraseSet = new Set(phrase.map((word) => word.toLowerCase()));
    const threshold = runThreshold(phrase);
    const boundary = lastSentenceBoundary(cue);
    if (boundary !== null) {
      const tail = cue.tokens.slice(boundary);
      const hits = tail.filter((token) => phraseSet.has(token.lower) || FILLERS.has(token.lower)).length;
      const aligned = alignedRun(tail, phrase, true);
      if (
        tail.length >= 3 &&
        tail.length <= 24 &&
        hits / tail.length >= 0.6 &&
        tail.filter((token) => phraseSet.has(token.lower)).length >= 3 &&
        aligned >= threshold
      ) {
        additions.push({ start: boundary, end: cue.tokens.length, label });
        continue;
      }
    }
    const matched = alignedRun(cue.tokens, phrase, true);
    if (matched >= threshold) {
      additions.push({ start: cue.tokens.length - matched, end: cue.tokens.length, label });
    }
  }
  return addSpans(cue, additions);
}

function attachPrefix(cue, labels) {
  if (cue.kind !== "cue" || cue.drop || !cue.tokens.length) return false;
  const additions = [];
  for (const label of labels) {
    const phrase = phraseWords(label);
    const matched = alignedRun(cue.tokens, phrase, false);
    if (matched >= runThreshold(phrase)) {
      additions.push({ start: 0, end: matched, label });
    }
  }
  return addSpans(cue, additions);
}

function lastSentenceBoundary(cue) {
  let boundary = null;
  for (let i = 0; i < cue.tokens.length - 1; i += 1) {
    const between = cue.body.slice(cue.tokens[i].end, cue.tokens[i + 1].start);
    if (/[.!?]/.test(between)) boundary = i + 1;
  }
  return boundary;
}

function addSpans(cue, additions) {
  if (!additions.length) return false;
  const before = cue.spans.reduce((sum, span) => sum + (span.end - span.start), 0);
  cue.spans = mergeSpans([...cue.spans, ...additions]);
  refreshCue(cue);
  const after = cue.spans.reduce((sum, span) => sum + (span.end - span.start), 0);
  return after > before;
}

function parseSrt(source) {
  const bom = source.startsWith(BOM);
  const text = bom ? source.slice(1) : source;
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const normalized = text.replace(/\r\n/g, "\n");
  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.replace(/^\n+|\n+$/g, ""))
    .filter((block) => block !== "")
    .map((block) => block.split("\n"));
  return { bom, newline, blocks };
}

function parseCue(lines) {
  const tsIdx = lines.findIndex((line) => TIMESTAMP_RE.test(line.trim()));
  if (tsIdx === -1) return { kind: "raw", lines };
  const timestamp = lines[tsIdx].trim();
  const match = TIMESTAMP_RE.exec(timestamp);
  const startMs = tsToMs(match[1]);
  const endMs = tsToMs(match[2]);
  const body = lines.slice(tsIdx + 1).join("\n").replace(/\n+$/, "");
  return {
    kind: "cue",
    lines,
    headerLines: lines.slice(0, tsIdx + 1),
    number: tsIdx > 0 ? lines[tsIdx - 1].trim() : "",
    timestamp,
    durationMs: startMs === null || endMs === null ? null : endMs - startMs,
    body,
    tokens: tokenize(body),
    spans: [],
    pass1: false,
    cleaned: body,
    drop: false,
    where: "",
    loopNames: [],
    loopTokenRatio: 0,
  };
}

export function analyzeSrt(source) {
  const parsed = parseSrt(source);
  const cues = parsed.blocks.map(parseCue);

  for (const cue of cues) {
    if (cue.kind !== "cue" || cue.tokens.length === 0) continue;
    let spans = [
      ...findRepeatSpans(cue.tokens, 2, MAX_PHRASE_LEN).filter((span) =>
        phraseSpanAllowed(span, cue.durationMs)
      ),
      ...findRepeatSpans(cue.tokens, 1, 1),
    ];
    spans = absorbStubs(cue.body, cue.tokens, spans);
    spans = absorbResiduals(cue.tokens, spans);
    cue.spans = spans;
    cue.pass1 = spans.length > 0;
    refreshCue(cue);
  }

  extendFromSources(cues);

  const episodes = [];
  let current = null;
  cues.forEach((cue, index) => {
    cue.index = index;
    if (cue.kind === "cue" && cue.spans.length) {
      if (!current) {
        current = [];
        episodes.push(current);
      }
      current.push(cue);
      return;
    }
    current = null;
  });

  return { ...parsed, cues, episodes };
}

/** Collapse "they have perfectly" and "perfectly they have" into one label. */
function displayNames(names) {
  const seen = new Set();
  const unique = [];
  for (const name of names) {
    const words = name.toLowerCase().split(/\s+/).filter(Boolean);
    let key = words.join(" ");
    for (let i = 1; i < words.length; i += 1) {
      const rotated = words.slice(i).concat(words.slice(0, i)).join(" ");
      if (rotated < key) key = rotated;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(name);
  }
  return unique;
}

function clip(text, max) {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1)}…`;
}

function cueRange(cues) {
  const first = cues[0].number || "?";
  const last = cues.at(-1).number || "?";
  return first === last ? `cue ${first}` : `cues ${first}–${last}`;
}

export function formatEpisode(episode, cues) {
  const names = displayNames(episode.flatMap((cue) => cue.loopNames));
  const lines = [];
  lines.push(`  ${cueRange(episode)} · “${names.join("”, “")}”`);

  const first = episode[0];
  const previous = first.index > 0 ? cues[first.index - 1] : null;
  if (previous?.kind === "cue" && previous.body && !previous.spans.length) {
    const prevText = previous.body.split("\n").at(-1) ?? "";
    lines.push(`  previous: ${clip(prevText, 90)}`);
  }

  let i = 0;
  while (i < episode.length) {
    const cue = episode[i];
    if (cue.drop) {
      let j = i + 1;
      while (j < episode.length && episode[j].drop) j += 1;
      const count = j - i;
      const names = displayNames(episode.slice(i, j).flatMap((item) => item.loopNames));
      lines.push(
        `  ${cueRange(episode.slice(i, j))}  drop ${count} cue${count === 1 ? "" : "s"} that ${
          count === 1 ? "is" : "are"
        } only “${names.join("”, “")}”`
      );
      i = j;
      continue;
    }
    lines.push(`  cue ${cue.number}  ${cue.timestamp}  loop at the ${cue.where}`);
    lines.push(`    now:  ${clip(cue.body, 140)}`);
    lines.push(`    keep: ${clip(cue.cleaned, 140)}`);
    i += 1;
  }
  return lines.join("\n");
}

function renderSrt(parsed, cues, accepted) {
  const nl = parsed.newline;
  let number = 0;
  const blocks = [];
  for (const cue of cues) {
    if (cue.kind !== "cue") {
      blocks.push(cue.lines.join(nl));
      continue;
    }
    const edit = accepted.has(cue.index);
    if (edit && cue.drop) continue;
    const lines = edit ? [...cue.headerLines, ...cue.cleaned.split("\n")] : [...cue.lines];
    const tsIdx = lines.findIndex((line) => TIMESTAMP_RE.test(line.trim()));
    if (tsIdx > 0) {
      number += 1;
      lines[tsIdx - 1] = String(number);
    }
    blocks.push(lines.join(nl));
  }
  const body = blocks.join(`${nl}${nl}`);
  return `${parsed.bom ? BOM : ""}${body}${nl}`;
}

async function collectSrtFiles(target) {
  const info = await stat(target);
  if (info.isFile()) {
    if (!target.endsWith(".srt")) {
      throw new Error(`Not an .srt file: ${target}`);
    }
    return [target];
  }
  if (!info.isDirectory()) return [];
  const found = [];
  const entries = await readdir(target, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const child = join(target, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await collectSrtFiles(child)));
    } else if (entry.isFile() && entry.name.endsWith(".srt")) {
      found.push(child);
    }
  }
  return found;
}

function usage() {
  console.log(`Usage: node scripts/detect-nonsense-subtitles.js [options] <file-or-directory>...

Look through .srt files for a word or short phrase repeated in a row
(Whisper loops, at the end of a cue, the start, or as whole cues).
Directories are walked recursively. Other file types are ignored.

  --report   show episodes and do not change files
  --yes      remove every episode without asking
  --help     show this help

With no flag, each episode asks:
  y  remove it (real words in the same cue stay)
  n  leave it
  a  remove this episode and every episode after it
  q  save what you already accepted and stop`);
}

async function ask(rl) {
  while (true) {
    const answer = (await rl.question("  Remove this episode? [y/n/a/q] ")).trim().toLowerCase();
    if (answer === "y" || answer === "yes") return "y";
    if (answer === "n" || answer === "no") return "n";
    if (answer === "a" || answer === "all") return "a";
    if (answer === "q" || answer === "quit") return "q";
    console.log("  Answer y, n, a, or q.");
  }
}

function isDirectRun() {
  const arg = process.argv[1];
  if (!arg) return false;
  return import.meta.url === pathToFileURL(resolve(arg)).href;
}

async function main() {
  const args = process.argv.slice(2);
  let report = false;
  let yes = false;
  const targets = [];

  for (const arg of args) {
    if (arg === "--report" || arg === "-r") report = true;
    else if (arg === "--yes" || arg === "-y") yes = true;
    else if (arg === "--help" || arg === "-h") {
      usage();
      return;
    } else if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}`);
      usage();
      process.exitCode = 1;
      return;
    } else {
      targets.push(arg);
    }
  }

  if (report && yes) {
    console.error("Use either --report or --yes.");
    process.exitCode = 1;
    return;
  }
  if (!targets.length) {
    usage();
    process.exitCode = 1;
    return;
  }
  if (!report && !yes && !input.isTTY) {
    console.error("No terminal attached. Re-run with --report to preview, or --yes to remove every episode.");
    process.exitCode = 1;
    return;
  }

  const files = [];
  for (const target of targets) {
    files.push(...(await collectSrtFiles(resolve(target))));
  }
  files.sort();

  if (!files.length) {
    console.log("No .srt files found.");
    return;
  }

  const jobs = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const analyzed = analyzeSrt(source);
    if (analyzed.episodes.length) {
      jobs.push({ file, source, analyzed });
    }
  }

  console.log(
    `Scanned ${files.length} .srt file${files.length === 1 ? "" : "s"}. ` +
      `${jobs.reduce((sum, job) => sum + job.analyzed.episodes.length, 0)} episode${
        jobs.reduce((sum, job) => sum + job.analyzed.episodes.length, 0) === 1 ? "" : "s"
      } in ${jobs.length} file${jobs.length === 1 ? "" : "s"}.`
  );
  if (!jobs.length) {
    console.log("No repeated-word loops found.");
    return;
  }
  if (!report && !yes) {
    console.log("Yes strips the loop and keeps other words in that cue. A cue that is only the loop is deleted.");
  }

  const rl = report || yes ? null : createInterface({ input, output });
  let acceptRest = yes;
  let stopped = false;
  let filesChanged = 0;
  let episodesRemoved = 0;
  let episodesKept = 0;
  let cuesDropped = 0;
  let cuesTrimmed = 0;

  try {
    for (const job of jobs) {
      if (stopped) break;
      const rel = relative(process.cwd(), job.file) || job.file;
      console.log(`\n${rel}`);
      const accepted = new Set();

      for (const episode of job.analyzed.episodes) {
        if (stopped) break;
        if (acceptRest) {
          console.log(`  remove ${cueRange(episode)} · “${displayNames(episode.flatMap((cue) => cue.loopNames)).join("”, “")}”`);
        } else if (report) {
          console.log(formatEpisode(episode, job.analyzed.cues));
        } else {
          console.log(formatEpisode(episode, job.analyzed.cues));
          const answer = await ask(rl);
          if (answer === "q") {
            stopped = true;
            break;
          }
          if (answer === "n") {
            episodesKept += 1;
            console.log("  left unchanged");
            continue;
          }
          if (answer === "a") acceptRest = true;
        }

        if (report) continue;

        for (const cue of episode) {
          accepted.add(cue.index);
          if (cue.drop) cuesDropped += 1;
          else cuesTrimmed += 1;
        }
        episodesRemoved += 1;
      }

      if (report || !accepted.size) continue;
      const next = renderSrt(job.analyzed, job.analyzed.cues, accepted);
      if (next !== job.source) {
        await writeFile(job.file, next, "utf8");
        filesChanged += 1;
        console.log(`  wrote ${rel}`);
      }
    }
  } finally {
    rl?.close();
  }

  if (report) return;

  console.log(
    `\nRemoved ${episodesRemoved} episode${episodesRemoved === 1 ? "" : "s"} ` +
      `(${cuesDropped} cue${cuesDropped === 1 ? "" : "s"} dropped, ` +
      `${cuesTrimmed} trimmed) in ${filesChanged} file${filesChanged === 1 ? "" : "s"}.`
  );
  if (episodesKept) {
    console.log(`Left ${episodesKept} episode${episodesKept === 1 ? "" : "s"} unchanged.`);
  }
  if (stopped) console.log("Stopped.");
}

if (isDirectRun()) {
  main().catch((error) => {
    console.error(error.message ?? error);
    process.exitCode = 1;
  });
}
