// Turns an engine script into exact timed actions. Pure: no DOM, Pixi or GSAP, so every
// timing property (all columns start falling on the same frame, landings, cue sync) is unit-testable.
import { BOARD_SIZE } from '../engine';
import type { Blast, BlastKind, Board, Color, Piece, Pos, Step } from '../engine';
import type { CueName } from '../audio/cues';
import { ANIM, fallDurationMs } from './constants';

export type Action =
  | { a: 'swap'; ids: [number, number]; to: [Pos, Pos] }
  | { a: 'swap-back'; ids: [number, number]; a1: Pos; b1: Pos }
  | { a: 'place'; removedId: number; piece: Piece; slot: number; at: Pos }
  | { a: 'pop'; id: number; at: Pos; key: string }
  | { a: 'morph'; id: number; piece: Piece }
  | { a: 'blast'; blast: Blast }
  | { a: 'fall'; id: number; col: number; fromRow: number; toRow: number }
  | { a: 'spawn'; piece: Piece; col: number; fromRow: number; toRow: number }
  | { a: 'land'; id: number }
  | { a: 'tray-fly'; color: Color; from: Pos; slot: number }
  | { a: 'tray-lost'; color: Color; from: Pos }
  | { a: 'score'; total: number; points: number; chain: number; combo: number }
  | { a: 'notice'; kind: 'tray-full' | 'level-up' | 'game-over'; level?: number }
  | { a: 'board-out' } | { a: 'board-in'; board: Board }
  | { a: 'cue'; name: CueName; chain?: number };
export interface Planned { atMs: number; durMs: number; action: Action }

type ClearStep = Extract<Step, { t: 'clear' }>;
type FallStep = Extract<Step, { t: 'fall' }>;

const POP_MS = ANIM.popGrowMs + ANIM.popCollapseMs;
const keyOf = (p: Pos) => `${p.row},${p.col}`;

const BLAST_CUE: Record<BlastKind, CueName> = {
  charge: 'charge-blast', arc: 'arc-blast', prism: 'prism-blast', supernova: 'prism-supernova',
};

function createCue(p: Piece): CueName | null {
  if (p.kind === 'prism') return 'prism-create';
  if (p.kind === 'gem' && p.special === 'charge') return 'charge-create';
  if (p.kind === 'gem' && p.special === 'arc') return 'arc-create';
  return null;
}

// Prism and supernova throw one bolt per target, `prismBoltStaggerMs` apart.
const firesBolts = (b: Blast) => b.kind === 'prism' || b.kind === 'supernova';

// A blast whose cells were all claimed elsewhere (cells: []) still gets one bolt's worth of time.
function blastDurationMs(b: Blast): number {
  if (b.kind === 'charge') return ANIM.chargeShake.ms;
  if (b.kind === 'arc') return ANIM.arcBeamMs;
  return Math.max(1, b.cells.length) * ANIM.prismBoltStaggerMs;
}

/** When, after the blast fires, it reaches its `index`-th cell. */
function hitOffsetMs(b: Blast, index: number): number {
  return firesBolts(b) ? index * ANIM.prismBoltStaggerMs : 0;
}

/** Timing of the latest clear round, which its score and tray steps hang off. */
interface Round { start: number; popsEnd: number; flyEnd: number }

class Planner {
  readonly items: Planned[] = [];
  t = 0;
  private round: Round | null = null;

  put(atMs: number, durMs: number, action: Action): void {
    this.items.push({ atMs, durMs, action });
  }

  cue(atMs: number, name: CueName, chain?: number): void {
    this.put(atMs, 0, chain === undefined ? { a: 'cue', name } : { a: 'cue', name, chain });
  }

  private current(): Round {
    return this.round ?? { start: this.t, popsEnd: this.t, flyEnd: this.t };
  }

  step(s: Step): void {
    const t = this.t;
    switch (s.t) {
      case 'swap':
        this.put(t, ANIM.swapMs, { a: 'swap', ids: s.ids, to: [s.b, s.a] });
        this.cue(t, 'swap');
        this.t += ANIM.swapMs;
        break;
      case 'swap-invalid':
        this.put(t, ANIM.invalidMs, { a: 'swap', ids: s.ids, to: [s.b, s.a] });
        this.put(t + ANIM.invalidMs, ANIM.invalidMs, { a: 'swap-back', ids: s.ids, a1: s.a, b1: s.b });
        this.cue(t + ANIM.invalidMs, 'swap-invalid');
        this.t += 2 * ANIM.invalidMs;
        break;
      case 'place':
        this.put(t, ANIM.placeMs, { a: 'place', removedId: s.removedId, piece: s.piece, slot: s.slot, at: s.at });
        this.cue(t + ANIM.placeMs, 'tray-place');
        this.t += ANIM.placeMs;
        break;
      case 'clear':
        this.clear(s);
        break;
      case 'score': {
        const { start } = this.current();
        this.put(start, 0, { a: 'score', total: s.total, points: s.points, chain: s.chain, combo: s.combo });
        break;
      }
      case 'tray-earn': {
        const round = this.current();
        const flyEnd = round.popsEnd + ANIM.trayFlyMs;
        this.put(round.popsEnd, ANIM.trayFlyMs, { a: 'tray-fly', color: s.color, from: s.from, slot: s.slot });
        this.cue(flyEnd, 'tray-earn');
        this.round = { ...round, flyEnd: Math.max(round.flyEnd, flyEnd) };
        break;
      }
      case 'tray-full': {
        const { flyEnd } = this.current();
        this.put(flyEnd, 0, { a: 'notice', kind: 'tray-full' });
        this.cue(flyEnd, 'tray-full');
        break;
      }
      case 'tray-lost': {
        const { popsEnd } = this.current();
        this.put(popsEnd, ANIM.trayFlyMs, { a: 'tray-lost', color: s.color, from: s.from });
        this.cue(popsEnd + ANIM.trayFlyMs, 'tray-lost');
        break;
      }
      case 'fall':
        this.fall(s);
        break;
      case 'level-up': {
        const inAt = t + ANIM.boardOutMs;
        const inMs = fallDurationMs(BOARD_SIZE) + ANIM.landMs;
        this.put(t, 0, { a: 'notice', kind: 'level-up', level: s.level });
        this.cue(t, 'level-up');
        this.put(t, ANIM.boardOutMs, { a: 'board-out' });
        this.put(inAt, inMs, { a: 'board-in', board: s.board });
        this.cue(inAt, 'board-in');
        this.t = inAt + inMs;
        break;
      }
      case 'game-over':
        this.put(t, 0, { a: 'notice', kind: 'game-over' });
        this.cue(t, 'game-over');
        break;
    }
  }

  // Matched cells pop at the round start; blasted cells pop when their blast reaches them.
  private clear(s: ClearStep): void {
    const start = this.t;
    let end = start + POP_MS;
    const hitAt = new Map<string, number>();
    for (const b of s.blasts) {
      const fireAt = start + b.order * ANIM.blastStaggerMs;
      const durMs = blastDurationMs(b);
      this.put(fireAt, durMs, { a: 'blast', blast: b });
      this.cue(fireAt, BLAST_CUE[b.kind]);
      b.cells.forEach((c, i) => {
        const k = keyOf(c);
        if (!hitAt.has(k)) hitAt.set(k, fireAt + hitOffsetMs(b, i));
      });
      end = Math.max(end, fireAt + durMs);
    }

    if (s.groups.length > 0) this.cue(start, 'match', s.chain);
    let popsEnd = start + POP_MS;
    let rockAt = Infinity;
    for (const c of s.cleared) {
      const popAt = c.cause === 'blast' ? (hitAt.get(keyOf(c.at)) ?? start) : start;
      this.put(popAt, POP_MS, { a: 'pop', id: c.id, at: c.at, key: c.key });
      popsEnd = Math.max(popsEnd, popAt + POP_MS);
      if (c.key === 'rock') rockAt = Math.min(rockAt, popAt);
    }
    if (rockAt !== Infinity) this.cue(rockAt, 'rock-break');

    for (const { piece } of s.created) {
      this.put(start, ANIM.createMs, { a: 'morph', id: piece.id, piece });
      const name = createCue(piece);
      if (name) this.cue(start, name);
    }

    this.round = { start, popsEnd, flyEnd: popsEnd };
    this.t = Math.max(end, popsEnd);
  }

  // Every fall and spawn starts on the same instant, under the same gravity.
  private fall(s: FallStep): void {
    const start = this.t;
    let lastLandEnd = start;
    const columns = new Map<number, { at: number; rock: boolean }>();
    const drop = (id: number, col: number, fromRow: number, toRow: number, action: Action, rock: boolean) => {
      const durMs = fallDurationMs(toRow - fromRow);
      const landAt = start + durMs;
      this.put(start, durMs, action);
      this.put(landAt, ANIM.landMs, { a: 'land', id });
      const column = columns.get(col) ?? { at: landAt, rock: false };
      columns.set(col, { at: Math.max(column.at, landAt), rock: column.rock || rock });
      lastLandEnd = Math.max(lastLandEnd, landAt + ANIM.landMs);
    };
    for (const f of s.falls) {
      drop(f.id, f.to.col, f.from.row, f.to.row, { a: 'fall', id: f.id, col: f.to.col, fromRow: f.from.row, toRow: f.to.row }, false);
    }
    for (const sp of s.spawns) {
      const { piece, to, fromRow } = sp;
      drop(piece.id, to.col, fromRow, to.row, { a: 'spawn', piece, col: to.col, fromRow, toRow: to.row }, piece.kind === 'rock');
    }
    // Only a rock coming in from above counts as a rock drop; the step script names no other piece kinds.
    for (const [, column] of [...columns].sort(([a], [b]) => a - b)) {
      this.cue(column.at, column.rock ? 'rock-drop' : 'land');
    }
    this.t = Math.max(start, lastLandEnd - ANIM.cascadeOverlapMs);
  }
}

export function planScript(script: Step[], opts: { timeScale?: number } = {}): { items: Planned[]; totalMs: number } {
  const scale = opts.timeScale ?? 1;
  const planner = new Planner();
  for (const s of script) planner.step(s);
  let totalMs = planner.t;
  for (const p of planner.items) totalMs = Math.max(totalMs, p.atMs + p.durMs);
  const items = planner.items
    .sort((x, y) => x.atMs - y.atMs)
    .map((p) => ({ atMs: p.atMs / scale, durMs: p.durMs / scale, action: p.action }));
  return { items, totalMs: totalMs / scale };
}
