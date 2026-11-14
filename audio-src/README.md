# audio-src

The sound sources for Voltline. **`voltline-sounds.xlsx` is the source of truth** for which cues exist, which file backs each one, and where each sound came from (provenance and licence). Edit the sheet, then regenerate the credits:

```bash
uv run scripts/sound-credits.py   # rewrites CREDITS.md from the sheet
```

## Files

- Name each file after its cue: `select.wav`, `level-up.wav`. Variants are `land-1.wav`, `land-2.wav`, `land-3.wav`; chain-specific matches would be `match-chain-1..5`.
- Accepted: `.wav`, `.mp3`, `.flac`, `.aif`, `.aiff`, top level only. Subfolders (the Freesound packs) and other files are sources for reference and are ignored by the encoder.
- Prefer WAV, mono for effects (stereo for `level-up`, `game-over`, `prism-supernova`, `new-best` and any `music-*`), at least 44.1 kHz. Leave the level alone: the encoder loudness-matches every file, and the mix between cues is tuned in `src/audio/cues.ts`.

## Encoding

```bash
npm run audio                    # encode everything that changed to public/audio/
npm run audio -- --report        # print duration, RMS, peak and gain per file; writes nothing
npm run audio -- --only select   # one cue
npm run audio -- --force         # re-encode even if outputs are newer
```

Needs ffmpeg (`brew install ffmpeg`). Each file is trimmed of silence, brought to -20 dBFS RMS, limited at -3 dBTP, then written as Opus/WebM and AAC/M4A. The encoded files in `public/audio/` are committed so deploys do not need ffmpeg.
