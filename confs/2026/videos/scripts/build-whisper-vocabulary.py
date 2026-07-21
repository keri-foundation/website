#!/usr/bin/env python3
"""
Build Whisper hotwords / initial prompts from curated KERICONF26 presentation subtitles.

Subtitle Edit (Whisper CTranslate2) cannot fine-tune on SRT files directly, but it
supports --hotwords and --initial_prompt. This script mines the curated .fixed.srt
files for domain vocabulary and speaker-specific terms for interview transcription.

Usage:
  python3 build-whisper-vocabulary.py
  python3 build-whisper-vocabulary.py --update-subtitle-edit
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from collections import Counter
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
VIDEOS_DIR = SCRIPT_DIR.parent
PRESENTATIONS_DIR = VIDEOS_DIR / "KERICONF26" / "subtitles"
INTERVIEWS_DIR = VIDEOS_DIR / "KERICONF26-interviews"
OUTPUT_DIR = INTERVIEWS_DIR / "whisper-config"

# Whisper reserves ~half its 448-token context for hotwords (~223 tokens).
# Stay conservative: long hotwords cause "maximum decoding length must be > 0".
HOTWORDS_MAX_CHARS = 320
INTERVIEW_HOTWORDS_MAX_CHARS = 380

SUBTITLE_EDIT_SETTINGS = Path.home() / "Library/Application Support/Subtitle Edit/Settings.json"

# Known KERI / conference vocabulary (always included).
SEED_TERMS = [
    "KERI",
    "KERIA",
    "KERIpy",
    "KEL",
    "KRAM",
    "ACDC",
    "ACDCs",
    "SEDI",
    "SPAC",
    "TSP",
    "Signify",
    "CESR",
    "CESR2",
    "verifiable credentials",
    "autonomic identifiers",
    "key event log",
    "witnesses",
    "watchers",
    "pre-rotation",
    "delegated authority",
    "DID",
    "DIDs",
    "FHIR",
    "CMS",
    "Health KERI",
    "KERI Foundation",
    "KERI Conference 2026",
]

# Acronyms that look important in all-caps regex but are not useful hotwords.
ACRONYM_BLOCKLIST = {
    "AND", "THE", "FOR", "BUT", "NOT", "YES", "ONE", "TWO", "NOW", "ALL", "ANY",
    "HOW", "WHO", "WHY", "AID", "ART", "ARM", "CA", "CI", "IT", "OR", "SO", "TO",
    "UP", "US", "WE", "BY", "IF", "IN", "ON", "AT", "AS", "AN", "BE", "DO", "GO",
    "HE", "ME", "MY", "NO", "OF", "OK", "TV", "UK", "CEO", "CIO", "AWS", "API",
    "AMD", "BBC", "B2B", "CARIN", "CAID", "AAID", "AIS", "ATO", "CHIP", "CIS",
    "A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4", "AO6", "AC", "BLID", "BYU",
}

# Sentence-fragment false positives from naive Title Case extraction.
MULTIWORD_BLOCKLIST = {
    "And It", "And Okay", "And Dan", "And Phil", "And Sam", "And Scott", "And Two",
    "And Apple", "And Cardano", "And Circus", "And Veridian", "And Pythons",
    "What KERI", "Open KERI", "The Digital", "The Future", "The Landscape",
    "State Of", "Async Architecture", "Authorization Policy", "Addressing Identifiers",
    "American College", "Anchoring Seal Reference", "Android Play Store",
}

# Map interview video basenames to presentation subtitle file stems (without .fixed.srt).
INTERVIEW_TO_PRESENTATIONS: dict[str, list[str]] = {
    "Ari-Argoud-Interview": ["Ari Argoud ｜ KRAM IT! with Ari ｜ KERI Conference 2026"],
    "Cole-Davis-Interview": [
        "Cole Davis ｜ Contract Credentials & Verifiable Identity ｜ KERI Conference 2026"
    ],
    "Daniel-Hardman-Interview": [
        "Daniel Hardman ｜ Applying KERI to General Evidence Problems ｜ KERI Conference 2026",
        "Daniel Hardman ｜ Open Verifiable Communications ｜ KERI Conference 2026",
    ],
    "Fergal-O'Connor": [
        "Fergal O'Connor ｜ KERIA & Signify Path to Production ｜ KERI Conference 2026",
        "Fergal O'Conner ｜ Signify Security Architecture ｜ KERI Conference 2026",
    ],
    "Jared-Jefferey-Interview": [
        "Jared Jefferey ｜ FHIR and CMS ｜ KERI Conference 2026",
        "Scott Stuewe Mark Scrimshire Jared Jeffery ｜ Provenanting Patient's Medical Records ｜ KERI Conf 2026",
    ],
    "Jonathan-Rayback-Interview": [
        "Jonathan Rayback ｜ KERI Bridge to the DID World ｜ KERI Conference 2026"
    ],
    "Keanu-Pahio-Interview": [
        "Keanu Pahio ｜ KERI Developement & Deployment ｜ KERI Conference 2026"
    ],
    "Kent-Bull-Interview": [
        "Kent Bull ｜ KERIA Tutorial ｜ KERI Conference 2026",
        "Kent Bull ｜ KERIpy Async Architecture ｜ KERI Conference 2026",
    ],
    "Ned-Smith-Interview": [
        "Ned Smith ｜ Secure Asset Transfer Protocol ｜ KERI Conference 2026"
    ],
    "Nicholas-Racz-Interview": [
        "Nicholas Racz ｜ Investigating the Game of Trust ｜ KERI Conference 2026"
    ],
    "Phil-Feairheller-Interview": [
        "Phil Feairheller ｜ ACDCs for Authorization ｜ KERI Conference 2026",
        "Phil Feairheller ｜ Infrastructure for Security ｜ Keri Conference 2026",
    ],
    "Phil-Windley-Interview": [
        "Phil Windley ｜ Digital Identity Needs a Legal Foundation ｜ KERI Conference 2026"
    ],
    "Ryan-Hansen-Interview": [
        "Ryan Hansen ｜ Witnesses & Watchers ｜ KERI Conference 2026",
        "Ryan Hansen Pannel ｜ What KERI allows us to do that we couldn't before ｜ KERI Conference 2026",
    ],
}

FILLER_WORDS = {
    "yeah", "okay", "well", "what", "now", "right", "yes", "there", "they", "this",
    "that", "when", "where", "which", "would", "could", "should", "have", "has",
    "had", "how", "why", "who", "one", "two", "three", "first", "just", "like",
    "also", "then", "than", "very", "really", "because", "before", "after",
    "about", "into", "over", "under", "through", "during", "while", "being",
    "been", "here", "today", "actually", "basically", "again", "anyway", "back",
    "another", "anything", "anybody", "absolutely", "all", "and", "are", "but",
    "the", "you", "it's", "that's", "there's", "we're", "they're", "i'll", "i've",
    "i'm", "he's", "she's", "we've", "you're", "you've", "didn't", "don't", "won't",
    "can't", "isn't", "aren't", "wasn't", "weren't", "event", "key", "sam", "aid",
    "foundation", "webs", "api", "pdf", "url", "http", "tls", "json", "fast",
}


def parse_srt_text(path: Path) -> str:
    lines: list[str] = []
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or re.fullmatch(r"\d+", line) or "-->" in line:
            continue
        lines.append(line)
    return " ".join(lines)


def speaker_from_filename(filename: str) -> str | None:
    match = re.match(r"^(.+?)\s*｜", filename)
    return match.group(1).strip() if match else None


def extract_terms(text: str) -> Counter[str]:
    scores: Counter[str] = Counter()

    for term in SEED_TERMS:
        if term.lower() in text.lower():
            scores[term] += 100

    for acronym in re.findall(r"\b[A-Z][A-Z0-9]{2,}(?:s|es)?\b", text):
        base = acronym.rstrip("es").rstrip("s")
        if acronym in ACRONYM_BLOCKLIST or base in ACRONYM_BLOCKLIST:
            continue
        scores[acronym] += 8

    for mixed in re.findall(r"\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b", text):
        scores[mixed] += 10

    for phrase in re.findall(r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b", text):
        if phrase in MULTIWORD_BLOCKLIST:
            continue
        if len(phrase.split()) > 4:
            continue
        scores[phrase] += 6

    for word, count in Counter(re.findall(r"[A-Za-z']{3,}", text)).items():
        lower = word.lower()
        if (
            word[0].isupper()
            and lower not in FILLER_WORDS
            and count >= 4
            and not re.fullmatch(r"I[''][a-z]+", word)
            and not re.fullmatch(r"(There|That|It|We|They|You)[''][a-z]+", word)
        ):
            scores[word] += count

    return scores


def fit_hotwords(scores: Counter[str], max_chars: int = HOTWORDS_MAX_CHARS) -> str:
    """Build comma-separated hotwords within Whisper's token budget."""
    ordered = [term for term, _ in scores.most_common()]
    selected: list[str] = []
    length = 0
    seen_lower: set[str] = set()

    for term in ordered:
        key = term.lower()
        if key in seen_lower or key in FILLER_WORDS:
            continue
        addition = len(term) + (2 if selected else 0)
        if length + addition > max_chars:
            break
        selected.append(term)
        seen_lower.add(key)
        length += addition

    return ", ".join(selected)


def build_initial_prompt() -> str:
    return (
        "KERI Conference 2026 interview about KERI, KRAM, ACDC, KEL, KERIA, "
        "SEDI, verifiable credentials, and Signify."
    )


def load_presentation_texts() -> dict[str, str]:
    texts: dict[str, str] = {}
    for path in sorted(PRESENTATIONS_DIR.glob("*.fixed.srt")):
        stem = path.name[: -len(".fixed.srt")]
        texts[stem] = parse_srt_text(path)
    return texts


def build_global_vocabulary(presentation_texts: dict[str, str]) -> tuple[str, str, Counter[str]]:
    all_text = " ".join(presentation_texts.values())
    for stem, text in presentation_texts.items():
        speaker = speaker_from_filename(stem)
        if speaker:
            all_text += f" {speaker}"

    scores = extract_terms(all_text)
    for stem in presentation_texts:
        speaker = speaker_from_filename(stem)
        if speaker:
            scores[speaker] += 50

    hotwords = fit_hotwords(scores)
    initial_prompt = build_initial_prompt()
    return hotwords, initial_prompt, scores


def build_interview_hotwords(
    local_scores: Counter[str],
    presentation_stems: list[str],
) -> str:
    scores: Counter[str] = Counter()
    for term in SEED_TERMS:
        scores[term] += 40
    scores.update(local_scores)
    for stem in presentation_stems:
        speaker = speaker_from_filename(stem)
        if speaker:
            scores[speaker] += 200
    return fit_hotwords(scores, max_chars=INTERVIEW_HOTWORDS_MAX_CHARS)


def build_interview_configs(
    presentation_texts: dict[str, str],
    global_scores: Counter[str],
) -> dict[str, dict[str, str]]:
    configs: dict[str, dict[str, str]] = {}

    for interview_stem, presentation_stems in INTERVIEW_TO_PRESENTATIONS.items():
        text_parts = [presentation_texts[stem] for stem in presentation_stems if stem in presentation_texts]
        if not text_parts:
            continue

        local_scores = extract_terms(" ".join(text_parts))
        hotwords = build_interview_hotwords(local_scores, presentation_stems)
        configs[interview_stem] = {
            "presentations": presentation_stems,
            "hotwords": hotwords,
            "initial_prompt": build_initial_prompt(),
        }

    return configs


def ctranslate2_advanced_args(hotwords: str, initial_prompt: str) -> str:
    # Quote values for Subtitle Edit advanced CLI field (space-separated args).
    escaped_hotwords = hotwords.replace('"', '\\"')
    escaped_prompt = initial_prompt.replace('"', '\\"')
    return (
        f'--vad_filter True --hotwords "{escaped_hotwords}" '
        f'--initial_prompt "{escaped_prompt}"'
    )


def update_subtitle_edit_settings(advanced_args: str) -> None:
    if not SUBTITLE_EDIT_SETTINGS.exists():
        print(f"Subtitle Edit settings not found at {SUBTITLE_EDIT_SETTINGS}", file=sys.stderr)
        sys.exit(1)

    backup = SUBTITLE_EDIT_SETTINGS.with_suffix(".json.bak-whisper-vocab")
    shutil.copy2(SUBTITLE_EDIT_SETTINGS, backup)

    data = json.loads(SUBTITLE_EDIT_SETTINGS.read_text(encoding="utf-8"))
    data["Tools"]["AudioToText"]["CommandLineParameterCTranslate2"] = advanced_args
    SUBTITLE_EDIT_SETTINGS.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(f"Updated Subtitle Edit CTranslate2 advanced args (backup: {backup})")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--update-subtitle-edit",
        action="store_true",
        help="Patch Subtitle Edit Settings.json with global hotwords/prompt",
    )
    args = parser.parse_args()

    if not PRESENTATIONS_DIR.is_dir():
        print(f"Missing presentations dir: {PRESENTATIONS_DIR}", file=sys.stderr)
        sys.exit(1)

    presentation_texts = load_presentation_texts()
    if not presentation_texts:
        print(f"No .fixed.srt files in {PRESENTATIONS_DIR}", file=sys.stderr)
        sys.exit(1)

    hotwords, initial_prompt, global_scores = build_global_vocabulary(presentation_texts)
    interview_configs = build_interview_configs(presentation_texts, global_scores)
    advanced_args = ctranslate2_advanced_args(hotwords, initial_prompt)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUTPUT_DIR / "hotwords.txt").write_text(hotwords + "\n", encoding="utf-8")
    (OUTPUT_DIR / "initial-prompt.txt").write_text(initial_prompt + "\n", encoding="utf-8")
    (OUTPUT_DIR / "subtitle-edit-advanced.txt").write_text(advanced_args + "\n", encoding="utf-8")
    (OUTPUT_DIR / "interview-configs.json").write_text(
        json.dumps(interview_configs, indent=2), encoding="utf-8"
    )

    print(f"Loaded {len(presentation_texts)} curated presentation subtitles")
    print(f"Wrote vocabulary to {OUTPUT_DIR}/")
    print(f"  hotwords: {len(hotwords.split(', '))} terms, {len(hotwords)} chars")
    print(f"  per-interview configs: {len(interview_configs)}")

    if args.update_subtitle_edit:
        update_subtitle_edit_settings(advanced_args)


if __name__ == "__main__":
    main()
