# /// script
# requires-python = ">=3.11"
# dependencies = ["openpyxl>=3.1"]
# ///
"""Generate audio-src/voltline-sounds.xlsx: the sound list Todd fills in.

Run:  uv run scripts/make-sound-sheet.py [--force]

The cue list mirrors spec §6.4 (docs/superpowers/specs/2026-11-13-voltline-rebuild-design.md)
and src/audio/cues.ts. Re-running refuses to overwrite an existing sheet (it may hold
Todd's provenance notes) unless --force is given.
"""

import sys
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

OUT = Path(__file__).resolve().parent.parent / "audio-src" / "voltline-sounds.xlsx"

# cue, required, plays when, length, channels, character, files expected
CUES = [
    ("select", True, "A piece is tapped or clicked to select it", "< 0.1 s", "mono", "Soft electric tick", "select.wav"),
    ("swap", True, "Two pieces trade places", "~0.2 s", "mono", "Quick swoosh", "swap.wav"),
    ("swap-invalid", True, "A swap makes no match and snaps back", "~0.3 s", "mono", "Short “denied” buzz", "swap-invalid.wav"),
    ("match", True, "A match pops (pitched up one semitone per chain level)", "~0.3 s", "mono", "Neutral, bright zap; one pitch", "match.wav"),
    ("match-chain-1 … 5", False, "Instead of pitch-shifting “match”, one file per chain level", "~0.3 s each", "mono", "Optional hand-tuned ascending set", "match-chain-1.wav … match-chain-5.wav"),
    ("land", True, "A column of pieces lands", "< 0.1 s", "mono", "Quiet click/thud; 2–3 variants avoid repetition", "land-1.wav, land-2.wav, land-3.wav"),
    ("charge-create", True, "A 4-match creates a Charge", "~0.5 s", "mono", "Power-up hum", "charge-create.wav"),
    ("charge-blast", True, "A Charge detonates (3×3)", "~0.6 s", "mono", "Punchy electric explosion", "charge-blast.wav"),
    ("arc-create", True, "An L or T match creates an Arc", "~0.5 s", "mono", "Crackle charging up", "arc-create.wav"),
    ("arc-blast", True, "An Arc fires its row and column", "~0.5 s", "mono", "Beam zap sweeping outward", "arc-blast.wav"),
    ("prism-create", True, "A 5-match creates a Prism", "~0.8 s", "mono", "Shimmering rising chord", "prism-create.wav"),
    ("prism-blast", True, "A Prism clears a whole color", "~1.0 s", "mono", "Lightning-storm crackle", "prism-blast.wav"),
    ("prism-supernova", False, "Prism + Prism clears the board", "~1.5–2 s", "stereo", "The biggest sound in the game", "prism-supernova.wav"),
    ("rock-drop", False, "A rock falls into the board", "~0.2 s", "mono", "Heavier, duller thud than “land”", "rock-drop.wav"),
    ("rock-break", True, "A rock is cleared", "~0.4 s", "mono", "Stone/metal shatter", "rock-break.wav"),
    ("tray-earn", True, "A piece is earned and flies into the tray", "~0.4 s", "mono", "Collect chime", "tray-earn.wav"),
    ("tray-full", True, "The tray fills up (with the on-screen notice)", "~0.5 s", "mono", "Warning chirp", "tray-full.wav"),
    # "tray-lost" is no longer used (the tray stops counting while full), so it is not generated.
    ("tray-pick", True, "The player picks up a tray piece", "< 0.2 s", "mono", "Lift blip", "tray-pick.wav"),
    ("tray-place", True, "A tray piece lands on the board", "~0.2 s", "mono", "Snap-in", "tray-place.wav"),
    ("hint-scan", False, "Hint arrows appear", "~1.0 s", "mono", "Soft scanning sweep under the reveal", "hint-scan.wav"),
    ("hint-lock", False, "The best hint arrow is isolated", "~0.3 s", "mono", "Lock-on ping", "hint-lock.wav"),
    ("level-up", True, "A level is complete", "~2 s", "stereo", "Fanfare / power surge", "level-up.wav"),
    ("board-in", False, "A fresh board drops in", "~0.8 s", "mono", "Power-on whoosh", "board-in.wav"),
    ("game-over", True, "No moves are left", "~2 s", "stereo", "Power-down", "game-over.wav"),
    ("new-best", False, "Game over with a new best score", "~1.5 s", "stereo", "Short triumphant sting", "new-best.wav"),
    ("ui-click", True, "Buttons (Hint, New game, speed…)", "< 0.1 s", "mono", "Neutral UI tick", "ui-click.wav"),
    ("ui-toggle", False, "AI mode on/off, mute", "~0.2 s", "mono", "Two-tone blip", "ui-toggle.wav"),
    ("music-loop", False, "Background music, on its own volume channel", "1–3 min", "stereo", "Optional; must loop seamlessly", "music-loop.wav"),
]

HEADERS = [
    "Cue", "Priority", "Plays when", "Target length", "Channels", "Character",
    "File name(s) to use", "Status", "File(s) supplied", "Provenance",
    "Creator / source", "License", "Source URL", "Date added", "Notes",
]
WIDTHS = [20, 11, 44, 13, 10, 34, 34, 12, 28, 20, 24, 18, 32, 12, 36]

STATUSES = ["Needed", "Supplied", "Encoded", "In game", "Skipped"]
PROVENANCE = [
    "Made by Todd", "Recorded by Todd", "Commissioned", "Purchased / licensed",
    "CC0 / public domain", "CC-BY", "Other Creative Commons", "AI-generated", "Other",
]


def build() -> Workbook:
    wb = Workbook()
    ws = wb.active
    ws.title = "Sounds"
    ws.append(HEADERS)
    for cue, required, when, length, ch, character, files in CUES:
        ws.append([cue, "★ Required" if required else "Polish", when, length, ch, character,
                   files, "Needed", None, None, None, None, None, None, None])

    head_fill = PatternFill("solid", fgColor="1B1F3A")
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = head_fill
        cell.alignment = Alignment(vertical="center", wrap_text=True)
    for i, w in enumerate(WIDTHS, start=1):
        ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = w
    for row in ws.iter_rows(min_row=2):
        for cell in row:
            cell.alignment = Alignment(vertical="top", wrap_text=True)
        if row[1].value == "★ Required":
            row[1].font = Font(bold=True)
    ws.freeze_panes = "B2"
    ws.auto_filter.ref = ws.dimensions

    last = len(CUES) + 1
    status = DataValidation(type="list", formula1='"' + ",".join(STATUSES) + '"', allow_blank=True)
    prov = DataValidation(type="list", formula1='"' + ",".join(PROVENANCE) + '"', allow_blank=True)
    ws.add_data_validation(status)
    ws.add_data_validation(prov)
    status.add(f"H2:H{last}")
    prov.add(f"J2:J{last}")
    for r in range(2, last + 1):
        ws.cell(row=r, column=14).number_format = "yyyy-mm-dd"

    g = wb.create_sheet("How to supply")
    lines = [
        ("Where files go", "audio-src/ in the repo root, next to this sheet. Name each file exactly as in “File name(s) to use”."),
        ("Format", "WAV, 44.1 or 48 kHz, 16- or 24-bit."),
        ("Channels", "Mono is fine for everything except the cues marked stereo (big moments and music)."),
        ("Trimming", "Don’t worry about leading/trailing silence or loudness; the encoder trims silence and normalizes peaks to −1 dBFS. Leave a natural tail on explosions."),
        ("Loops", "music-loop must be cut on a seamless loop point."),
        ("Variants", "For land, supply 2–3 slightly different takes (land-1.wav …). For chain levels, either one match.wav (pitched automatically) or match-chain-1 … 5."),
        ("After adding files", "Run npm run audio. It writes compressed .webm (Opus) and .m4a (AAC) copies to public/audio/, which the game loads."),
        ("Missing sounds", "The game runs silently for any cue without a file, so you can add them a few at a time."),
        ("Provenance", "Fill in Provenance, Creator / source, License and Source URL for every file. AI-ASSISTANCE.md quotes this sheet, so mark AI-generated sounds as such."),
        ("Status", "Needed → Supplied (file dropped in) → Encoded (npm run audio done) → In game (heard it play)."),
    ]
    g.append(["Topic", "Guidance"])
    for a, b in lines:
        g.append([a, b])
    for cell in g[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = head_fill
    g.column_dimensions["A"].width = 20
    g.column_dimensions["B"].width = 110
    for row in g.iter_rows(min_row=2):
        row[0].font = Font(bold=True)
        for cell in row:
            cell.alignment = Alignment(vertical="top", wrap_text=True)
    return wb


def main() -> int:
    if OUT.exists() and "--force" not in sys.argv:
        print(f"{OUT} exists (it may hold your notes); pass --force to overwrite.", file=sys.stderr)
        return 1
    OUT.parent.mkdir(parents=True, exist_ok=True)
    build().save(OUT)
    print(f"wrote {OUT} ({len(CUES)} cues)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
