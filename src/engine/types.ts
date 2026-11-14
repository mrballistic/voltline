export const BOARD_SIZE = 8;
export const COLORS = ['red', 'blue', 'yellow', 'green', 'magenta', 'orange', 'cyan'] as const;
export type Color = typeof COLORS[number];
export type GemSpecial = 'none' | 'charge' | 'arc';
export type Piece =
  | { id: number; kind: 'gem'; color: Color; special: GemSpecial }
  | { id: number; kind: 'prism' }
  | { id: number; kind: 'rock' };
export type Board = (Piece | null)[][]; // [row][col]
export interface Pos { row: number; col: number }
export type MatchKey = Color | 'rock';
export type MatchShape = 'line3' | 'line4' | 'line5' | 'cross';
export interface MatchGroup { key: MatchKey; cells: Pos[]; shape: MatchShape }
export type Move = { type: 'swap'; a: Pos; b: Pos } | { type: 'place'; slot: number; at: Pos };
export type BlastKind = 'charge' | 'arc' | 'prism' | 'supernova';
/** `color` is what a prism blast clears: a gem color, or `'rock'` for a prism swapped with a rock. */
export interface Blast { kind: BlastKind; at: Pos; cells: Pos[]; order: number; color?: MatchKey }
export interface Cleared { id: number; at: Pos; cause: 'match' | 'blast'; key: MatchKey | 'prism' }
export interface Fall { id: number; from: Pos; to: Pos }
export interface Spawn { piece: Piece; to: Pos; fromRow: number } // fromRow < 0
export interface GameState {
  board: Board; level: number; score: number; levelStartScore: number; levelTarget: number;
  tray: Color[]; counters: Record<Color, number>; moves: number; nextId: number;
  rngState: number; over: boolean; seed: number;
}
export type Step =
  | { t: 'swap'; a: Pos; b: Pos; ids: [number, number] }
  | { t: 'swap-invalid'; a: Pos; b: Pos; ids: [number, number] }
  | { t: 'place'; slot: number; at: Pos; removedId: number; piece: Piece }
  | { t: 'clear'; chain: number; groups: MatchGroup[]; blasts: Blast[]; cleared: Cleared[];
      created: { at: Pos; piece: Piece }[] }
  | { t: 'score'; chain: number; combo: number; points: number; total: number }
  | { t: 'tray-earn'; color: Color; from: Pos; slot: number }
  | { t: 'tray-full' }
  | { t: 'fall'; falls: Fall[]; spawns: Spawn[] }
  | { t: 'level-up'; level: number; board: Board }
  | { t: 'game-over' };
