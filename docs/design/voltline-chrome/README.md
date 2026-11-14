# Voltline chrome mockups (reference only)

Source files of the Claude Design canvas for the chrome redesign: https://claude.ai/artifact/Lix1oz9XNFch4WU49yZada (private to Todd; ask him for access).

**The spec is `docs/superpowers/specs/2026-11-13-voltline-chrome-design.md`.** Implement from that. These files are here so exact values (colors, sizes, SVG paths) can be looked up when a spec line is unclear. Where they disagree with the spec, the spec wins.

These are `.dc.html` files for the canvas runtime, so they don’t render on their own in a browser. Read them as markup. Nothing here ships, and nothing should be imported from here.

| File | What it is |
|---|---|
| `Main.dc.html` | The whole app screen as one component; its `screen` prop (`idle`, `hint`, `ai`, `tray`, `levelup`, `muted`, `gfx`, `gameover`, `gameover-best`, `gameover-ai`, `howto`, `howto-scrolled`) and `device` prop (`phone`, `desktop`) pick the state. Every value used in the mockups is in here. |
| `Phone-*.dc.html`, `Desktop-*.dc.html` | One artboard per state; each just mounts `Main` with a `screen` and `device`. |
| `NotFound.dc.html`, `Desktop-404.dc.html` | The 404 page at both sizes. |
| `Tokens-color.dc.html` | Color, glow and contrast table (data in its script block). |
| `Tokens-type.dc.html` | Type scale, spacing, sizes, height budget and motion (data in its script block). |
| `Components.dc.html` | Button state matrix and per-component specs. |
| `Notes.dc.html` | What changed, copy changes, recommendations, MUI theme sketch, open questions. |
| `Logo.dc.html` | Logo proposal: construction, lockups, icon sizes, one-color versions. |
| `logo-app-icon.svg` | 1024 app-icon master with the V mark. Adopted: the desktop icon renders from a copy, `src-tauri/icons/source.svg`. |
| `canvas.json` | Canvas layout index. |

The board pieces and hint arrows drawn in the mockups are context only; the PixiJS renderer owns them.
