// Every sound cue in the game (spec §6.4). The manifest (bus, gain, voices, cooldown) is added in Task 18.
export type CueName =
  | 'select' | 'swap' | 'swap-invalid'
  | 'match' | 'match-chain-1' | 'match-chain-2' | 'match-chain-3' | 'match-chain-4' | 'match-chain-5'
  | 'land'
  | 'charge-create' | 'charge-blast' | 'arc-create' | 'arc-blast'
  | 'prism-create' | 'prism-blast' | 'prism-supernova'
  | 'rock-drop' | 'rock-break'
  | 'tray-earn' | 'tray-full' | 'tray-lost' | 'tray-pick' | 'tray-place'
  | 'hint-scan' | 'hint-lock'
  | 'level-up' | 'board-in' | 'game-over' | 'new-best'
  | 'ui-click' | 'ui-toggle'
  | 'music-loop';

/** Where the player sends cues; the Web Audio engine implements it (Task 18). */
export interface CueSink { cue(name: CueName, opts?: { chain?: number }): void }

/** Plays nothing; the stand-in until the sound engine exists. */
export const silentCues: CueSink = { cue() {} };
