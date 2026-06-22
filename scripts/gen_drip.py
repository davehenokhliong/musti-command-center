#!/usr/bin/env python3
"""Generate data/drip.json FROM the brain's energy-patterns.md.

SINGLE SOURCE OF TRUTH = vault/areas/Area - Energy and DRIP.md (in the PersonalBrain repo).
This script DERIVES the dashboard's drip.json from it, so the two never drift.
Edit the markdown only; then run:  python3 scripts/gen_drip.py
"""
import json, re, sys, pathlib

HERE = pathlib.Path(__file__).resolve().parent.parent          # musti-command-center/
SRC = HERE.parent / "SecondBrain" / "vault" / "areas" / "Area - Energy and DRIP.md"
OUT = HERE / "data" / "drip.json"

# Fixed framework scaffolding (labels/hints don't change — only items do)
QUADRANTS = {
    "production":  {"label": "Production",  "hint": "money + joy → DO MORE", "marker": "Production"},
    "replacement": {"label": "Replacement", "hint": "money, low joy → automate / hire to replace", "marker": "Replacement"},
    "investment":  {"label": "Investment",  "hint": "joy, low money → invest in (compounds)", "marker": "Investment"},
    "delegation":  {"label": "Delegation",  "hint": "low money, low joy → delegate away", "marker": "Delegation"},
}

def section(md, header):
    """Return the list-item lines under a `## header ...` until the next `##`."""
    lines = md.splitlines()
    out, grab = [], False
    for ln in lines:
        if ln.startswith("## "):
            grab = header.lower() in ln.lower()
            continue
        if grab and ln.strip().startswith("- "):
            out.append(ln.strip()[2:].strip())
    return out

def strip_md(s):
    return re.sub(r"[*_`]", "", s).strip()

def main():
    md = SRC.read_text(encoding="utf-8")

    # energizes / drains
    energizes = [strip_md(x) for x in section(md, "What energizes")]
    drains    = [strip_md(x) for x in section(md, "What drains")]

    # rhythm (Peak / Trough lines)
    peak = trough = ""
    for ln in section(md, "Productivity rhythm"):
        t = strip_md(ln)
        if t.lower().startswith("peak"):   peak = t
        if t.lower().startswith("trough"): trough = t

    # DRIP quadrants — items come after the colon on each "**Name** (...): a, b, c" line
    quad = {}
    for key, meta in QUADRANTS.items():
        items = []
        pat = re.compile(r"\*\*" + meta["marker"] + r"\*\*\s*\([^)]*\):\s*(.+)", re.I)
        for ln in md.splitlines():
            m = pat.search(ln)
            if m:
                raw = strip_md(m.group(1))
                if "none yet" not in raw.lower():
                    items = [i.strip() for i in raw.split(",") if i.strip()]
                break
        quad[key] = {"label": meta["label"], "hint": meta["hint"], "items": items}

    out = {
        "_meta": {
            "note": "GENERATED from vault/areas/Area - Energy and DRIP.md — DO NOT EDIT BY HAND. Run scripts/gen_drip.py.",
            "framework": "Production = do more · Replacement = automate/hire · Investment = invest in · Delegation = delegate away",
            "source": "PersonalBrain:vault/areas/Area - Energy and DRIP.md",
            "lastReviewed": "",
        },
        "rhythm": {"peak": peak, "trough": trough},
        "energizes": energizes,
        "drains": drains,
        "quadrants": quad,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"✓ generated {OUT.relative_to(HERE)} from {SRC.name}")
    print(f"  energizes={len(energizes)} drains={len(drains)} " +
          " ".join(f"{k}={len(v['items'])}" for k, v in quad.items()))

if __name__ == "__main__":
    if not SRC.exists():
        sys.exit(f"source not found: {SRC}")
    main()
