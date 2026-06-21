# Musti Command Center

Private internal dashboard. Tabs: Who You Are · Portfolio · Networking · Knowledge · Settings.

- `data/*.json` — source-of-truth snapshots (portfolio, expenses, profile, networking).
  Eventually synced from Google Sheets via `scripts/sync_sheets.py`.
- `dashboards/index.html` — the command-center UI (reads `data/*.json`).
- `scripts/make_summaries.py` — bridges data → markdown digests for the gbrain brain.

Separate from the `PersonalBrain` repo on purpose (assistants use this; private notes stay out).
