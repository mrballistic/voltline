// Orchestrates one game: input → engine → script player, plus the hint and best scores.
// Not React: the UI reads `snapshot()` through `onChange`. The engine state advances the moment a
// move is accepted, while everything the player sees (score, tray, level, notices) follows the
// script's planned actions as they play, and equals the engine state once `busy` turns false.
import { TRAY_CAPACITY, applyMove, canPlace, isAdjacent, newGame } from '../engine';
import type { Color, GameState, Move, Pos } from '../engine';
import type { AIClient } from '../ai/client';
import { MASTER_VOLUME } from '../audio/cues';
import type { RankedMove } from '../ai/search';
import { ANIM } from '../render/constants';
import type { Action } from '../render/plan';
import type { ScriptPlayerLike } from '../render/player';
import { silentSound, type AISpeed, type HintViewLike, type Prefs, type PrefsStore, type SoundLike } from './ports';

export interface UiSnapshot {
  score: number;
  level: number;
  levelProgress: number;
  tray: Color[];
  trayFull: boolean;
  moves: number;
  over: boolean;
  busy: boolean;
  selected: Pos | null;
  selectedSlot: number | null;
  aiOn: boolean;
  aiSpeed: AISpeed;
  aiMoves: number;
  /** The AI loop is waiting on a ranking. */
  aiThinking: boolean;
  muted: boolean;
  /** Set when the game just ended: its score beat the saved best for its kind (strictly). */
  newBest: boolean;
  /** The kind of the game that last ended (AI mode moved in it), which picks the best to show. */
  overAI: boolean;
  best: { player: number; ai: number };
  notice: { kind: 'tray-full' | 'level-up' | 'game-over'; level?: number } | null;
}

export interface GameControllerDeps {
  player: ScriptPlayerLike;
  ai: AIClient;
  hint: HintViewLike;
  prefs: PrefsStore;
  /** UI cues and the sound settings. Board cues come from the script player's timeline, not from here. */
  audio?: SoundLike;
  onChange: (s: UiSnapshot) => void;
  /** Seed of the first game; later games use seed + 1, + 2, … (random when absent). */
  seed?: number;
  /** Start from this state instead of a fresh game (tests and dev fixtures). */
  initial?: GameState;
  /** Used by AI mode to pause while the tab is hidden. */
  doc?: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>;
  /** Where errors that must not break play go (a failed save, a failed relayout). Defaults to
   * rethrowing on a later tick, so they reach the console and window.onerror. */
  reportError?: (err: unknown) => void;
}

/** What the player currently sees, which lags the engine state while a script plays. */
interface Shown { score: number; level: number; levelStart: number; levelTarget: number; tray: Color[]; over: boolean }

/** AI mode per speed: how long the hint reveal runs before each move, and the rest after it. */
export const AI_PACE: Record<AISpeed, { revealMs: number; pauseMs: number }> = {
  slow: { revealMs: 1000, pauseMs: 600 },
  medium: { revealMs: 500, pauseMs: 300 },
  fast: { revealMs: 150, pauseMs: 100 },
};

/** Rank failures in a row after which AI mode gives up (one retry covers a worker that just died). */
const AI_MAX_FAILURES = 2;

const isDisposedError = (err: unknown) => err instanceof Error && err.message === 'disposed';

const randomSeed = () => Math.floor(Math.random() * 2 ** 32);
const same = (a: Pos, b: Pos) => a.row === b.row && a.col === b.col;

/** Surfaces an error from fire-and-forget input handling without an unhandled rejection. */
const rethrowLater = (err: unknown) => setTimeout(() => { throw err; });

export class GameController {
  private readonly d: GameControllerDeps;
  private readonly audio: SoundLike;
  private _state: GameState;
  private shown: Shown;
  private prefs: Prefs;
  private games = 0;
  private busy = false;
  /** The move or deal in progress; newGame waits on it. */
  private current: Promise<void> | null = null;
  private relayoutPending = false;
  private selected: Pos | null = null;
  private selectedSlot: number | null = null;
  private notice: UiSnapshot['notice'] = null;
  private aiOn = false;
  private aiMoves = 0;
  private aiThinking = false;
  /** AI loop generation: bumped by setAI, newGame and dispose, so an older loop or ranking is dropped. */
  private aiGen = 0;
  /** Wakes the AI loop's waits (pause, hidden tab) when its generation ends. */
  private readonly aiWakers = new Set<() => void>();
  /** Bumped whenever the state changes, so a hint ranked for an old state is dropped. */
  private version = 0;
  private disposed = false;
  private newBest = false;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(deps: GameControllerDeps) {
    this.d = deps;
    this.prefs = deps.prefs.load();
    this.audio = deps.audio ?? silentSound;
    this.audio.setMuted(this.prefs.muted);
    this.audio.setVolume(MASTER_VOLUME);
    this._state = deps.initial ?? newGame(this.nextSeed());
    this.shown = this.shownFrom(this._state);
  }

  get state(): GameState {
    return this._state;
  }

  snapshot(): UiSnapshot {
    const s = this.shown;
    return {
      score: s.score,
      level: s.level,
      levelProgress: Math.min(1, Math.max(0, (s.score - s.levelStart) / s.levelTarget)),
      tray: [...s.tray],
      trayFull: s.tray.length >= TRAY_CAPACITY,
      moves: this._state.moves,
      over: s.over,
      busy: this.busy,
      selected: this.selected,
      selectedSlot: this.selectedSlot,
      aiOn: this.aiOn,
      aiSpeed: this.prefs.aiSpeed,
      aiMoves: this.aiMoves,
      aiThinking: this.aiThinking,
      muted: this.prefs.muted,
      newBest: this.newBest,
      overAI: this.aiMoves > 0,
      best: { player: this.prefs.bestPlayer, ai: this.prefs.bestAI },
      notice: this.notice,
    };
  }

  /** Planned actions from the script player (score, notices, tray flights), at their instants. */
  onAction(a: Action): void {
    const s = this.shown;
    switch (a.a) {
      case 'score':
        s.score = a.total;
        break;
      case 'tray-fly':
        s.tray[a.slot] = a.color;
        break;
      case 'notice':
        this.notice = a.level === undefined ? { kind: a.kind } : { kind: a.kind, level: a.level };
        if (a.kind === 'game-over') s.over = true;
        if (this.noticeTimer) clearTimeout(this.noticeTimer);
        this.noticeTimer = null;
        if (a.kind === 'level-up') {
          const shownNotice = this.notice;
          this.noticeTimer = setTimeout(() => {
            this.noticeTimer = null;
            if (this.notice !== shownNotice) return;
            this.notice = null;
            this.emit();
          }, ANIM.levelNoticeMs);
        }
        if (a.kind === 'level-up' && a.level !== undefined) {
          s.level = a.level;
          // Only one level-up per move, so the engine's new state holds its range.
          if (this._state.level === a.level) {
            s.levelStart = this._state.levelStartScore;
            s.levelTarget = this._state.levelTarget;
          }
        }
        break;
      default:
        return;
    }
    this.emit();
  }

  tapCell(p: Pos): void {
    if (!this.acceptsInput()) return;
    this.d.hint.clear();
    if (this.selectedSlot !== null) {
      const slot = this.selectedSlot;
      this.selectedSlot = null;
      if (canPlace(this._state.board, this._state.tray, slot, p)) this.fire({ type: 'place', slot, at: p });
      else this.emit();
      return;
    }
    const sel = this.selected;
    if (sel && isAdjacent(sel, p)) {
      this.selected = null;
      this.fire({ type: 'swap', a: sel, b: p });
      return;
    }
    this.selected = sel && same(sel, p) ? null : p;
    if (this.selected) this.audio.cue('select');
    this.emit();
  }

  tapSlot(slot: number): void {
    if (!this.acceptsInput()) return;
    this.d.hint.clear();
    this.selected = null;
    this.selectedSlot = slot < this._state.tray.length && this.selectedSlot !== slot ? slot : null;
    if (this.selectedSlot !== null) this.audio.cue('tray-pick');
    this.emit();
  }

  /** Places tray slot `slot` on `at` (a drag from the tray). Anything illegal just clears the selection. */
  place(slot: number, at: Pos): void {
    if (!this.acceptsInput()) return;
    this.d.hint.clear();
    this.selected = null;
    this.selectedSlot = null;
    if (slot < this._state.tray.length && canPlace(this._state.board, this._state.tray, slot, at)) this.fire({ type: 'place', slot, at });
    else this.emit();
  }

  /** Whether player input would be taken right now (not while a move plays, in AI mode, or over). */
  get canAcceptInput(): boolean {
    return this.acceptsInput();
  }

  swap(a: Pos, b: Pos): void {
    if (!this.acceptsInput()) return;
    this.d.hint.clear();
    this.selected = null;
    this.selectedSlot = null;
    if (isAdjacent(a, b)) this.fire({ type: 'swap', a, b });
    else this.emit();
  }

  /** Applies `move` and plays its script. Dropped (resolves at once) while a move is playing. */
  submit(move: Move): Promise<void> {
    return this.apply(move, false);
  }

  private async apply(move: Move, byAI: boolean): Promise<void> {
    if (this.busy || this.disposed || this._state.over) return;
    const { state: next, script } = applyMove(this._state, move);
    if (script.length === 0) return;
    this.d.hint.clear();
    this.selected = null;
    this.selectedSlot = null;
    this.clearNotice();
    if (next !== this._state) {
      this.version++;
      // Counted before the script plays, so a game the AI's first move ends is still an AI game.
      if (byAI) this.aiMoves++;
    }
    this._state = next;
    if (move.type === 'place') this.shown.tray = this.shown.tray.filter((_, i) => i !== move.slot);
    await this.run(() => this.d.player.play(script, { board: next.board, tray: next.tray }), () => {
      // The game-over dialog opens as this play ends; its "New best!" gets its sting then.
      if (next.over && this.recordBest()) this.audio.cue('new-best');
    });
  }

  /** Deals the first board onto the empty canvas. */
  start(): Promise<void> {
    if (this.busy || this.current || this.disposed) return Promise.resolve();
    const { board, tray } = this._state;
    return this.run(() => this.d.player.show({ board, tray }));
  }

  /** Starts a fresh game once the current move (if any) has finished playing. */
  async newGame(): Promise<void> {
    if (!this.disposed) this.audio.cue('ui-click');
    this.endAILoop(); // a ranking for the old game must never land on the new one
    while (this.current) {
      const c = this.current;
      await c.catch(() => {});
      if (this.current === c) break; // never spin on a task whose cleanup didn't clear it
    }
    if (this.disposed) return;
    this.recordBest();
    this.d.hint.clear();
    this._state = newGame(this.nextSeed());
    this.version++;
    this.shown = this.shownFrom(this._state);
    this.selected = null;
    this.selectedSlot = null;
    this.clearNotice();
    this.newBest = false;
    this.aiMoves = 0;
    const { board, tray } = this._state;
    const dealt = this.run(() => this.d.player.show({ board, tray }));
    if (this.aiOn) this.startAILoop(); // it waits for the deal like any other move
    await dealt;
  }

  /** The click cue for chrome that doesn't change the game (the How to play button). */
  uiClick(): void {
    if (!this.disposed) this.audio.cue('ui-click');
  }

  /** Shows the AI's ranked moves for the current board. */
  async hint(): Promise<void> {
    if (this.busy || this.aiOn || this.disposed || this._state.over) return;
    this.audio.cue('ui-click');
    const version = this.version;
    let ranked: RankedMove[];
    try {
      ranked = await this.d.ai.rank(this._state);
    } catch (err) {
      if (!isDisposedError(err) && !this.disposed) this.report(err);
      return;
    }
    if (version !== this.version || this.busy || this.aiOn || this.disposed) return;
    await this.d.hint.show(ranked, { revealMs: ANIM.hint.revealMs, holdMs: ANIM.hint.holdMs });
  }

  /** AI mode on or off (the player's switch). While on, player input is ignored and the AI loop plays. */
  setAI(on: boolean): void {
    if (on === this.aiOn || this.disposed) return;
    this.audio.cue('ui-toggle');
    this.switchAI(on);
  }

  /** Turns AI mode on or off without the switch's sound (the loop giving up uses this). */
  private switchAI(on: boolean): void {
    if (on === this.aiOn || this.disposed) return;
    this.aiOn = on;
    this.selected = null;
    this.selectedSlot = null;
    this.d.hint.clear();
    if (on) this.startAILoop();
    else this.endAILoop();
    this.emit();
  }

  setAISpeed(s: AISpeed): void {
    if (s !== this.prefs.aiSpeed) this.audio.cue('ui-click');
    this.savePrefs({ aiSpeed: s });
    this.emit();
  }

  /** Sound settings persist through prefs and go straight to the audio engine. Muting is silent
   * by definition; unmuting plays the toggle. */
  setMuted(m: boolean): void {
    this.savePrefs({ muted: m });
    this.audio.setMuted(m);
    this.audio.cue('ui-toggle');
    this.emit();
  }

  /** The canvas changed size. Deferred to the end of the running timeline. */
  relayout(): void {
    if (this.busy) this.relayoutPending = true;
    else this.d.player.relayout();
  }

  dispose(): void {
    this.disposed = true;
    this.endAILoop();
    this.clearNotice();
    this.d.ai.dispose();
    this.d.hint.clear();
  }

  /** Starts a new loop generation, ending any loop still running, so two can never overlap. */
  private startAILoop(): void {
    this.endAILoop();
    const gen = this.aiGen;
    // A failed move or hint must not leave AI mode on with nothing playing and input locked.
    this.aiLoop(gen).catch((err: unknown) => {
      if (gen === this.aiGen) this.setThinking(false);
      if (gen === this.aiGen && this.aiOn) this.switchAI(false);
      this.report(err);
    });
  }

  /** Ends the running loop's generation: its waits wake, and anything it was waiting on is dropped. */
  private endAILoop(): void {
    this.aiGen++;
    this.aiThinking = false;
    for (const wake of this.aiWakers) wake();
    this.aiWakers.clear();
  }

  /**
   * One generation of AI mode: rank, show the hint briefly, play the best move, pause, repeat,
   * until the game is over or the generation ends. Each step re-checks the generation and the
   * state version, so a stale ranking is dropped instead of landing on a newer board.
   */
  private async aiLoop(gen: number): Promise<void> {
    const live = () => gen === this.aiGen && this.aiOn && !this.disposed;
    let failures = 0;
    while (live()) {
      await this.whenVisible(gen);
      if (!live()) return;
      if (this.current) {
        await this.current.catch(() => {}); // a deal or a move still playing
        continue;
      }
      if (this._state.over) return;
      const version = this.version;
      const state = this._state;
      this.setThinking(true);
      let ranked: RankedMove[];
      try {
        ranked = await this.d.ai.rank(state);
      } catch (err) {
        if (!live()) return;
        this.setThinking(false);
        if (isDisposedError(err)) return;
        this.report(err);
        if (++failures >= AI_MAX_FAILURES) this.switchAI(false);
        continue;
      }
      if (!live()) return;
      this.setThinking(false);
      failures = 0;
      if (version !== this.version || this.busy) continue; // ranked for a board that has moved on
      const best = ranked[0];
      if (!best) {
        // Never happens: a live game always has a productive move. Say so rather than sit idle.
        this.report(new Error('AI found no move on a live board'));
        this.switchAI(false);
        return;
      }
      const pace = AI_PACE[this.prefs.aiSpeed];
      await this.d.hint.show(ranked, { revealMs: pace.revealMs, holdMs: 0 });
      if (!live()) return;
      this.d.hint.clear(); // never overlaps the move's animation
      if (version !== this.version || this.busy) continue;
      await this.apply(best.move, true);
      if (!live() || this._state.over) return;
      await this.aiWait(gen, pace.pauseMs);
    }
  }

  /** Resolves after `ms`, or at once when the generation ends. */
  private aiWait(gen: number, ms: number): Promise<void> {
    if (gen !== this.aiGen) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.aiWakers.delete(done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.aiWakers.add(done);
    });
  }

  /** Resolves once the tab is visible (at once if it is), or when the generation ends. */
  private whenVisible(gen: number): Promise<void> {
    const doc = this.d.doc;
    if (!doc?.hidden || gen !== this.aiGen) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        doc.removeEventListener('visibilitychange', onChange);
        this.aiWakers.delete(done);
        resolve();
      };
      const onChange = () => { if (!doc.hidden) done(); };
      doc.addEventListener('visibilitychange', onChange);
      this.aiWakers.add(done);
    });
  }

  private setThinking(on: boolean): void {
    if (this.aiThinking === on) return;
    this.aiThinking = on;
    this.emit();
  }

  private acceptsInput(): boolean {
    return !this.busy && !this.aiOn && !this.disposed && !this._state.over;
  }

  private fire(move: Move): void {
    this.submit(move).catch((err: unknown) => this.report(err));
  }

  /** Runs one animation with `busy` set; on its end shows the engine state and runs deferred work. */
  private async run(animate: () => Promise<void>, after?: () => void): Promise<void> {
    this.busy = true;
    this.emit();
    // The player is started synchronously (its script reaches the board this tick), but a sync
    // throw becomes a rejection, so the cleanup below always runs after `current` is set.
    let started: Promise<void>;
    try {
      started = animate();
    } catch (err) {
      started = Promise.reject(err);
    }
    // Nothing in the cleanup may escape it, or `current` would never clear and newGame would wait forever.
    const task: Promise<void> = started.finally(() => {
      try {
        this.shown = this.shownFrom(this._state);
        if (this._state.over) this.notice = { kind: 'game-over' };
        after?.();
        if (this.relayoutPending) {
          this.relayoutPending = false;
          if (!this.disposed) this.d.player.relayout();
        }
      } catch (err) {
        this.report(err);
      } finally {
        this.busy = false;
        if (this.current === task) this.current = null;
      }
      try {
        this.emit();
      } catch (err) {
        this.report(err);
      }
    });
    this.current = task;
    await task;
  }

  private clearNotice(): void {
    this.notice = null;
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = null;
  }

  /** Keeps the game's score as the best for its kind (an AI game is any game AI mode moved in).
   * Returns whether it beat the saved best. */
  private recordBest(): boolean {
    const key = this.aiMoves > 0 ? 'bestAI' : 'bestPlayer';
    if (this._state.score <= this.prefs[key]) return false;
    this.newBest = true; // only ever set here: a repeat call (New Game after game over) must not clear it
    this.savePrefs({ [key]: this._state.score });
    return true;
  }

  /** Keeps the new prefs for this session even when storing them fails (quota, private mode). */
  private savePrefs(patch: Partial<Prefs>): void {
    this.prefs = { ...this.prefs, ...patch };
    try {
      this.d.prefs.save(this.prefs);
    } catch (err) {
      this.report(err);
    }
  }

  private report(err: unknown): void {
    (this.d.reportError ?? rethrowLater)(err);
  }

  private shownFrom(s: GameState): Shown {
    return {
      score: s.score, level: s.level, levelStart: s.levelStartScore, levelTarget: s.levelTarget,
      tray: [...s.tray], over: s.over,
    };
  }

  private nextSeed(): number {
    const seed = this.d.seed === undefined ? randomSeed() : (this.d.seed + this.games) >>> 0;
    this.games++;
    return seed;
  }

  private emit(): void {
    if (!this.disposed) this.d.onChange(this.snapshot());
  }
}
