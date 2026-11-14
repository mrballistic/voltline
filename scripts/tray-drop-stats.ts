// Evidence for the tray drag bug (Voltline 1.1 Task 3), engine only:
//   npx tsx scripts/tray-drop-stats.ts [games]
// Plays seeded games (best-scoring productive move each turn, placements preferred) and, at every
// turn with a tray piece, asks two questions about tray drops:
//   1. Of all 64 cells, how many would `canPlace` refuse, and why (same color, special, rock)?
//   2. For each productive placement (a drop a player would aim for), how many of the 4 cells
//      beside the target would refuse a slightly-off drop? Beside a matching target are the
//      pieces of the run it completes, which are the dropped color.
import { BOARD_SIZE, applyMove, canPlace, newGame, productiveMoves } from '../src/engine';
import type { GameState, Pos } from '../src/engine';

const games = Number(process.argv[2] ?? 40);
const why = (s: GameState, slot: number, at: Pos): 'ok' | 'same' | 'special' | 'rock' => {
  if (canPlace(s.board, s.tray, slot, at)) return 'ok';
  const p = s.board[at.row][at.col];
  if (!p || p.kind === 'rock') return 'rock';
  if (p.kind === 'prism' || p.special !== 'none') return 'special';
  return 'same';
};
const all = { ok: 0, same: 0, special: 0, rock: 0 };
const beside = { ok: 0, same: 0, special: 0, rock: 0, off: 0 };
let targets = 0;
let maxLevel = 0;
for (let seed = 1; seed <= games; seed++) {
  let s = newGame(seed);
  for (let turn = 0; turn < 400 && !s.over; turn++) {
    maxLevel = Math.max(maxLevel, s.level);
    for (let slot = 0; slot < s.tray.length; slot++) {
      for (let row = 0; row < BOARD_SIZE; row++) for (let col = 0; col < BOARD_SIZE; col++) all[why(s, slot, { row, col })]++;
    }
    const moves = productiveMoves(s);
    for (const m of moves) {
      if (m.type !== 'place') continue;
      targets++;
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const n = { row: m.at.row + dr, col: m.at.col + dc };
        if (n.row < 0 || n.row >= BOARD_SIZE || n.col < 0 || n.col >= BOARD_SIZE) { beside.off++; continue; }
        beside[why(s, m.slot, n)]++;
      }
    }
    const pick = moves.find((m) => m.type === 'place') ?? moves[0];
    if (!pick) break;
    s = applyMove(s, pick).state;
  }
}
const pct = (n: number, d: number) => `${((100 * n) / d).toFixed(1)}%`;
const totalAll = all.ok + all.same + all.special + all.rock;
console.log(`${games} games, up to level ${maxLevel}`);
console.log(`all cells x tray pieces: ${totalAll}; refused ${pct(totalAll - all.ok, totalAll)} (same color ${pct(all.same, totalAll)}, special ${pct(all.special, totalAll)}, rock ${pct(all.rock, totalAll)})`);
const totalB = beside.ok + beside.same + beside.special + beside.rock;
console.log(`productive placement targets: ${targets}; on-board neighbours ${totalB}; a drop one cell off is refused ${pct(totalB - beside.ok, totalB)} (same color ${pct(beside.same, totalB)}, special ${pct(beside.special, totalB)}, rock ${pct(beside.rock, totalB)})`);
