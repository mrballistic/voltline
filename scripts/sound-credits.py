# /// script
# requires-python = ">=3.11"
# dependencies = ["openpyxl>=3.1"]
# ///
"""Write CREDITS.md from audio-src/voltline-sounds.xlsx.

Run:  uv run scripts/sound-credits.py

The sheet is the source of truth for sound provenance (Todd edits it). CC-BY
sounds require attribution, so regenerate CREDITS.md whenever the sheet changes.
"""

from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parent.parent
SHEET = ROOT / "audio-src" / "voltline-sounds.xlsx"
OUT = ROOT / "CREDITS.md"

LICENSE_URLS = {
    "CC0 1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
    "CC BY 3.0": "https://creativecommons.org/licenses/by/3.0/",
    "CC BY 4.0": "https://creativecommons.org/licenses/by/4.0/",
}


def main() -> int:
    ws = load_workbook(SHEET, read_only=True)["Sounds"]
    header = [c for c in next(ws.iter_rows(max_row=1, values_only=True))]
    col = {name: header.index(name) for name in header if name}
    rows = []
    for r in ws.iter_rows(min_row=2, values_only=True):
        if r[col["Status"]] in ("Skipped", "Needed", None):
            continue
        rows.append(r)

    lines = [
        "# Credits",
        "",
        "Voltline is MIT licensed (see LICENSE). The sound effects below come from other",
        "creators under their own licenses. Sounds marked CC BY require this attribution;",
        "CC0 sounds are credited as a courtesy.",
        "",
        "This file is generated from `audio-src/voltline-sounds.xlsx` by",
        "`uv run scripts/sound-credits.py`. Edit the sheet, not this file.",
        "",
        "## Sound effects",
        "",
        "| Cue | File(s) | Creator and title | License | Source |",
        "|---|---|---|---|---|",
    ]
    for r in rows:
        lic = r[col["License"]] or ""
        lic_md = f"[{lic}]({LICENSE_URLS[lic]})" if lic in LICENSE_URLS else lic
        urls = " ".join(f"<{u}>" for u in str(r[col["Source URL"]] or "").split())
        lines.append(
            f"| `{r[col['Cue']]}` | {r[col['File(s) supplied']]} | {r[col['Creator / source']]} | {lic_md} | {urls} |"
        )
    lines += [
        "",
        "Changes: sounds are trimmed, peak-normalized and re-encoded (Opus and AAC) for the",
        "web by `npm run audio`; some are pitch-shifted at runtime.",
        "",
    ]
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ({len(rows)} sounds)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
