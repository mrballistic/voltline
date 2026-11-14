// Every sound cue in the game (spec §6.4) and the manifest that tunes each one.
export type CueName =
  | 'select' | 'swap' | 'swap-invalid'
  | 'match' | 'match-chain-1' | 'match-chain-2' | 'match-chain-3' | 'match-chain-4' | 'match-chain-5'
  | 'land'
  | 'charge-create' | 'charge-blast' | 'arc-create' | 'arc-blast'
  | 'prism-create' | 'prism-blast' | 'prism-supernova'
  | 'rock-drop' | 'rock-break'
  | 'tray-earn' | 'tray-full' | 'tray-pick' | 'tray-place'
  | 'hint-scan' | 'hint-lock'
  | 'level-up' | 'board-in' | 'game-over' | 'new-best'
  | 'ui-click' | 'ui-toggle'
  | 'music-loop';

/** Cues with their own manifest entry (the match-chain-N files are variants of `match`, found via `chainSet`). */
export type ManifestCue = Exclude<CueName, `match-chain-${number}`>;

export interface CueSpec {
  bus: 'sfx' | 'ui' | 'music';
  /** Starting gain in dB; the source files are loudness-matched, so the mix lives here. Tune by ear. */
  gain: number;
  voices: number;
  cooldownMs: number;
  /** Files `name-1..n` instead of `name`. */
  variants?: number;
  /** Files `match-chain-1..n` are used for chain levels 1..n-1 when loaded. */
  chainSet?: number;
  loop?: boolean;
  stereo?: boolean;
}

export interface CueSink {
  cue(name: CueName, opts?: { chain?: number }): void;
}

const sfx = (gain: number, voices = 2, cooldownMs = 30, extra: Partial<CueSpec> = {}): CueSpec => ({
  bus: 'sfx', gain, voices, cooldownMs, ...extra,
});
const ui = (): CueSpec => ({ bus: 'ui', gain: -8, voices: 2, cooldownMs: 30 });

export const CUES: Record<ManifestCue, CueSpec> = {
  select: sfx(-6, 2, 30),
  swap: sfx(-3),
  'swap-invalid': sfx(-3),
  match: sfx(-3, 4, 40, { chainSet: 5 }),
  land: sfx(-6, 3, 40, { variants: 3 }),
  'charge-create': sfx(-3),
  'charge-blast': sfx(0),
  'arc-create': sfx(-3),
  'arc-blast': sfx(0),
  'prism-create': sfx(-3),
  'prism-blast': sfx(0),
  'prism-supernova': sfx(0, 1, 200, { stereo: true }),
  'rock-drop': sfx(-3),
  'rock-break': sfx(-3),
  'tray-earn': sfx(-3),
  'tray-full': sfx(-3),
  'tray-pick': sfx(-6),
  'tray-place': sfx(-3),
  'hint-scan': sfx(-3, 1, 100),
  'hint-lock': sfx(-3, 1, 100),
  'level-up': sfx(0, 1, 200, { stereo: true }),
  'board-in': sfx(-3, 1, 200),
  'game-over': sfx(0, 1, 200, { stereo: true }),
  'new-best': sfx(-3, 1, 200, { stereo: true }),
  'ui-click': ui(),
  'ui-toggle': ui(),
  'music-loop': { bus: 'music', gain: -3, voices: 1, cooldownMs: 0, loop: true, stereo: true },
};

/** Plays nothing; the stand-in where no sound engine is attached (tests, early boot). */
export const silentCues: CueSink = { cue() {} };
