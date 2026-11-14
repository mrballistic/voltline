import { COLORS } from './types';
import type { Board, Cleared, Color, GameState, MatchGroup, Move, Piece, Pos, Step } from './types';
import { cloneBoard, createBoard } from './board';
import { applyGravity } from './gravity';
import { findMatches, matchKeyOf } from './matches';
import { isAdjacent, isGameOver, isLegalSwap, pieceAt } from './moves';
import { Rng } from './rng';
import { levelTarget } from './rules';
import { scoreRound } from './scoring';
import { resolveBlasts, specialCell, specialFor } from './specials';
import type { BlastSeed } from './specials';
import { canPlace, countClears } from './tray';

const keyOf = (p: Pos) => `${p.row},${p.col}`;

type Created = { at: Pos; piece: Piece };

/** Mutable scratch for one `applyMove`; built from copies, so the input state is never touched. */
interface Work {
  board: Board; score: number; tray: Color[]; counters: Record<Color, number>;
  nextId: number; level: number; rng: Rng; script: Step[];
}

/** What a prism swap adds to round 0, on top of the ordinary matches. */
interface Opening { seeds: BlastSeed[]; preCleared: Pos[]; created: Created[] }

export function newGame(seed: number): GameState {
  const rng = new Rng(seed);
  const { board, nextId } = createBoard(rng, 1, 1);
  const counters = Object.fromEntries(COLORS.map((c) => [c, 0])) as Record<Color, number>;
  return {
    board, level: 1, score: 0, levelStartScore: 0, levelTarget: levelTarget(1),
    tray: [], counters, moves: 0, nextId, rngState: rng.state, over: false, seed,
  };
}

// One cascade round: clear groups and blasts, create specials, score, bank, then fall.
function runRound(w: Work, chain: number, groups: MatchGroup[], moved: Pos[], opening?: Opening): void {
  const board = w.board;
  const after = cloneBoard(board);
  const matched = new Set<string>();
  for (const g of groups) for (const c of g.cells) matched.add(keyOf(c));

  // New specials from qualifying groups; their cells survive this round. A prism-converted
  // special always detonates and clears, so a group whose special would land on one makes none.
  const created: Created[] = [...(opening?.created ?? [])];
  const openingSeeds = new Set((opening?.seeds ?? []).map((s) => keyOf(s.at)));
  const kept = new Set<string>();
  for (const g of groups) {
    const kind = specialFor(g.shape);
    if (!kind || g.key === 'rock') continue;
    const at = specialCell(g, moved);
    if (openingSeeds.has(keyOf(at))) continue;
    const id = board[at.row][at.col]!.id;
    const piece: Piece = kind === 'prism' ? { id, kind: 'prism' } : { id, kind: 'gem', color: g.key, special: kind };
    after[at.row][at.col] = piece;
    created.push({ at, piece: { ...piece } });
    kept.add(keyOf(at));
  }

  // Specials inside matched cells detonate; resolveBlasts leaves those to the caller.
  const seeds: BlastSeed[] = [...(opening?.seeds ?? [])];
  const seeded = new Set(seeds.map((s) => keyOf(s.at)));
  for (const g of groups) {
    for (const c of g.cells) {
      const p = board[c.row][c.col];
      if (p?.kind === 'gem' && p.special !== 'none' && !seeded.has(keyOf(c))) {
        seeds.push({ kind: p.special, at: c });
        seeded.add(keyOf(c));
      }
    }
  }
  const preCleared = opening?.preCleared ?? [];
  const blocked = new Set([...matched, ...kept, ...preCleared.map(keyOf)]);
  const { blasts, cells: blasted } = seeds.length > 0 ? resolveBlasts(after, seeds, blocked) : { blasts: [], cells: [] };

  const cleared: Cleared[] = [];
  const clear = (at: Pos, cause: Cleared['cause']) => {
    const p = board[at.row][at.col]!;
    cleared.push({ id: p.id, at, cause, key: p.kind === 'prism' ? 'prism' : matchKeyOf(p)! });
    after[at.row][at.col] = null;
  };
  for (const g of groups) for (const c of g.cells) if (!kept.has(keyOf(c))) clear(c, 'match');
  for (const c of preCleared) clear(c, 'blast');
  for (const c of blasted) clear(c, 'blast');

  const blastOnly = cleared.filter((c) => c.cause === 'blast').length;
  const { points, combo } = scoreRound(groups, blastOnly, chain);
  w.score += points;
  w.script.push({ t: 'clear', chain, groups, blasts, cleared, created });
  w.script.push({ t: 'score', chain, combo, points, total: w.score });

  const banked = countClears(w.counters, w.tray, cleared);
  w.counters = banked.counters;
  w.tray = banked.tray;
  w.script.push(...banked.events);

  const fell = applyGravity(after, w.rng, w.level, w.nextId);
  w.board = fell.board;
  w.nextId = fell.nextId;
  w.script.push({ t: 'fall', falls: fell.falls, spawns: fell.spawns });
}

function cascade(w: Work, moved: Pos[], opening?: Opening): void {
  let groups = findMatches(w.board);
  if (groups.length === 0 && !opening) return;
  runRound(w, 0, groups, moved, opening);
  for (let chain = 1; (groups = findMatches(w.board)).length > 0; chain++) runRound(w, chain, groups, []);
}

// `board` is post-swap: the piece from `a` now sits at `b` and vice versa.
function prismOpening(board: Board, a: Pos, b: Pos): Opening {
  const fromA = board[b.row][b.col]!;
  const fromB = board[a.row][a.col]!;
  if (fromA.kind === 'prism' && fromB.kind === 'prism') {
    return { seeds: [{ kind: 'supernova', at: b }], preCleared: [a], created: [] };
  }
  const [prismAt, partner] = fromA.kind === 'prism' ? [b, fromB] : [a, fromA];
  // Rocks aren't specials, so the blast reaches only rocks and nothing chains from them.
  if (partner.kind === 'rock') return { seeds: [{ kind: 'prism', at: prismAt, color: 'rock' }], preCleared: [], created: [] };
  if (partner.kind !== 'gem') throw new Error('prism swap partner must be a gem or a rock');
  if (partner.special === 'none') {
    return { seeds: [{ kind: 'prism', at: prismAt, color: partner.color }], preCleared: [], created: [] };
  }
  // Every gem of the partner's color becomes the partner's special, then each detonates.
  const special = partner.special;
  const opening: Opening = { seeds: [], preCleared: [prismAt], created: [] };
  board.forEach((row, r) => row.forEach((p, c) => {
    if (p?.kind !== 'gem' || p.color !== partner.color) return;
    const at = { row: r, col: c };
    const piece: Piece = { ...p, special };
    board[r][c] = piece;
    opening.created.push({ at, piece: { ...piece } });
    opening.seeds.push({ kind: special, at });
  }));
  return opening;
}

export function applyMove(state: GameState, move: Move): { state: GameState; script: Step[] } {
  if (state.over) return { state, script: [] };
  const w: Work = {
    board: state.board, score: state.score, tray: state.tray, counters: state.counters,
    nextId: state.nextId, level: state.level, rng: new Rng(state.rngState), script: [],
  };

  if (move.type === 'swap') {
    const { a, b } = move;
    const pa = pieceAt(state.board, a);
    const pb = pieceAt(state.board, b);
    if (!pa || !pb) return { state, script: [] };
    if (!isAdjacent(a, b) || !isLegalSwap(state.board, a, b)) {
      return { state, script: [{ t: 'swap-invalid', a, b, ids: [pa.id, pb.id] }] };
    }
    w.script.push({ t: 'swap', a, b, ids: [pa.id, pb.id] });
    w.board = cloneBoard(state.board);
    w.board[a.row][a.col] = pb;
    w.board[b.row][b.col] = pa;
    const prism = pa.kind === 'prism' || pb.kind === 'prism';
    cascade(w, [a, b], prism ? prismOpening(w.board, a, b) : undefined);
  } else {
    const { slot, at } = move;
    if (!canPlace(state.board, state.tray, slot, at)) return { state, script: [] };
    const piece: Piece = { id: w.nextId++, kind: 'gem', color: state.tray[slot], special: 'none' };
    w.tray = state.tray.filter((_, i) => i !== slot);
    w.board = cloneBoard(state.board);
    w.board[at.row][at.col] = piece;
    w.script.push({ t: 'place', slot, at, removedId: state.board[at.row][at.col]!.id, piece: { ...piece } });
    cascade(w, [at]);
  }

  let { level, levelStartScore, levelTarget: target } = state;
  if (w.score - levelStartScore >= target) {
    level += 1;
    levelStartScore = w.score;
    target = levelTarget(level);
    const fresh = createBoard(w.rng, level, w.nextId);
    w.board = fresh.board;
    w.nextId = fresh.nextId;
    w.script.push({ t: 'level-up', level, board: cloneBoard(fresh.board) });
  }

  const next: GameState = {
    ...state, board: w.board, score: w.score, tray: w.tray, counters: w.counters, nextId: w.nextId,
    level, levelStartScore, levelTarget: target, moves: state.moves + 1, rngState: w.rng.state,
  };
  if (isGameOver(next)) {
    next.over = true;
    w.script.push({ t: 'game-over' });
  }
  return { state: next, script: w.script };
}
