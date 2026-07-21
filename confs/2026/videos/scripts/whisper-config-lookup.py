#!/usr/bin/env python3
"""Print hotwords and initial_prompt for an interview (tab-separated)."""

from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> None:
    if len(sys.argv) != 3:
        print("usage: whisper-config-lookup.py CONFIG_JSON INTERVIEW_STEM", file=sys.stderr)
        sys.exit(1)

    config_path = Path(sys.argv[1])
    stem = sys.argv[2]
    config_dir = config_path.parent

    configs = json.loads(config_path.read_text(encoding="utf-8"))
    entry = configs.get(stem, {})

    hotwords = entry.get("hotwords") or (config_dir / "hotwords.txt").read_text(encoding="utf-8").strip()
    prompt = entry.get("initial_prompt") or (config_dir / "initial-prompt.txt").read_text(encoding="utf-8").strip()

    # Tab-separated, single line each (prompts are one line)
    print(f"{hotwords}\t{prompt}")


if __name__ == "__main__":
    main()
