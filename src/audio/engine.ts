import { CUES, type CueName, type CueSink, type CueSpec, type ManifestCue } from './cues';

export interface AudioEngineDeps {
  createContext: () => AudioContext;
  fetch: typeof fetch;
  /** URL prefix the encoded files live under, e.g. `./audio` (no trailing slash). */
  base: string;
  /**
   * Keys of the files that exist under `base` (the generated `AUDIO_FILES`). Only manifest keys in
   * this list are fetched, so a cue, variant or chain file that has no file yet costs no request.
   */
  files: readonly string[];
  rng?: () => number;
  /** Millisecond clock for cooldowns. Defaults to `performance.now`. */
  now?: () => number;
  /** Picks `.webm` (Opus) when true, `.m4a` otherwise. Defaults to an `Audio.canPlayType` probe. */
  canPlayWebm?: () => boolean;
  /** Called with the file key (`land-2`, `match-chain-3`) each time a source starts. Dev diagnostics. */
  onPlay?: (key: string) => void;
}

const MAX_CHAIN_SEMITONES = 7;
const PITCH_JITTER = 0.03;
const GAIN_JITTER_DB = 1.5;
/** How long a cue fired just before the context runs may wait to play (the first tap's select). */
const PENDING_MAX_MS = 300;

const dbToLinear = (db: number): number => 10 ** (db / 20);

function probeWebm(): boolean {
  try {
    return new Audio().canPlayType('audio/webm; codecs="opus"') !== '';
  } catch {
    return false;
  }
}

/** File keys (without extension) the manifest can use: every cue, variant and chain file. */
export function manifestFileKeys(): string[] {
  const keys: string[] = [];
  for (const [name, spec] of Object.entries(CUES) as [ManifestCue, CueSpec][]) {
    if (spec.variants) for (let i = 1; i <= spec.variants; i++) keys.push(`${name}-${i}`);
    else keys.push(name);
    if (spec.chainSet) for (let i = 1; i <= spec.chainSet; i++) keys.push(`${name}-chain-${i}`);
  }
  return keys;
}

/** Web Audio sfx/ui/music player. Every failure path degrades to silence. */
export class AudioEngine implements CueSink {
  private readonly deps: AudioEngineDeps;
  private readonly rng: () => number;
  private readonly now: () => number;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses: Partial<Record<CueSpec['bus'], GainNode>> = {};
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly active = new Map<string, Set<AudioBufferSourceNode>>();
  private readonly lastStart = new Map<string, number>();
  private unlocked = false;
  private muted = false;
  private volume = 1;
  private disposed = false;
  /** Suspended for a hidden tab: cues are dropped, not held. */
  private paused = false;
  /** Fetched files waiting for the context that `unlock` creates. */
  private readonly encoded = new Map<string, { url: string; data: ArrayBuffer }>();
  /** Files being fetched or decoded. */
  private inFlight = 0;
  private pending: { name: CueName; opts?: { chain?: number }; at: number } | null = null;

  constructor(deps: AudioEngineDeps) {
    this.deps = deps;
    this.rng = deps.rng ?? Math.random;
    this.now = deps.now ?? (() => performance.now());
  }

  /** The context's state, or `none` before it exists (and after dispose). */
  get state(): AudioContextState | 'none' {
    return this.ctx?.state ?? 'none';
  }

  private context(): AudioContext | null {
    if (this.ctx || this.disposed) return this.ctx;
    try {
      const ctx = this.deps.createContext();
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : this.volume;
      master.connect(ctx.destination);
      for (const bus of ['sfx', 'ui', 'music'] as const) {
        const g = ctx.createGain();
        g.connect(master);
        this.buses[bus] = g;
      }
      this.master = master;
      this.ctx = ctx;
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  /** The manifest keys that have a file to fetch. */
  private fileKeys(): string[] {
    const present = new Set(this.deps.files);
    return manifestFileKeys().filter((key) => present.has(key));
  }

  /**
   * Fetches every listed file; decoding waits for `unlock`, since a context may only be created on a user
   * gesture. Missing files are skipped with one dev warning each.
   */
  async load(): Promise<void> {
    if (this.disposed) return;
    const ext = (this.deps.canPlayWebm ?? probeWebm)() ? 'webm' : 'm4a';
    await Promise.all(
      this.fileKeys().map(async (key) => {
        const url = `${this.deps.base}/${key}.${ext}`;
        this.inFlight++;
        let data: ArrayBuffer;
        try {
          const res = await this.deps.fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          data = await res.arrayBuffer();
        } catch {
          this.inFlight--;
          if (import.meta.env.DEV && !this.disposed) console.warn(`[audio] missing or undecodable: ${url}`);
          return;
        }
        if (this.disposed) return;
        if (this.ctx) await this.decode(this.ctx, key, url, data);
        else this.encoded.set(key, { url, data });
      }),
    );
  }

  /** Decodes one fetched file into `ctx`; an undecodable file is skipped with one dev warning. */
  private async decode(ctx: AudioContext, key: string, url: string, data: ArrayBuffer): Promise<void> {
    try {
      const buffer = await ctx.decodeAudioData(data);
      if (!this.disposed) this.buffers.set(key, buffer);
    } catch {
      if (import.meta.env.DEV && !this.disposed) console.warn(`[audio] missing or undecodable: ${url}`);
    } finally {
      this.inFlight--;
    }
    this.flushPending();
  }

  /**
   * Call only from an event that counts as a user gesture (mouse pointerdown, touch or pen
   * pointerup, keydown). Creates the context on the first call, decodes what `load` fetched, and
   * resumes a context that is not running (a later gesture recovers an interrupted one).
   */
  unlock(): void {
    const ctx = this.context();
    if (!ctx) return;
    this.unlocked = true;
    this.paused = false;
    if (ctx.state !== 'running') this.resumeContext(ctx);
    const fetched = [...this.encoded];
    this.encoded.clear();
    for (const [key, f] of fetched) void this.decode(ctx, key, f.url, f.data);
  }

  private resumeContext(ctx: AudioContext): void {
    ctx.resume?.()?.then(() => this.flushPending(), () => {});
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyMaster();
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    this.applyMaster();
  }

  private applyMaster(): void {
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }

  /** The page went away (hidden tab): nothing plays, and nothing is held for later. */
  suspend(): void {
    this.paused = true;
    this.pending = null;
    this.ctx?.suspend?.()?.catch(() => {});
  }

  /** The page is back. Always asks: a suspend still settling would leave a 'running' state stale. */
  resume(): void {
    this.paused = false;
    if (this.unlocked && this.ctx) this.resumeContext(this.ctx);
  }

  /** Closes the context and drops every buffer; the engine stays silent from then on. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    this.buses = {};
    this.buffers.clear();
    this.encoded.clear();
    this.active.clear();
    this.pending = null;
    ctx?.close?.()?.catch(() => {});
  }

  /**
   * Plays `name` now. A cue that arrives after the unlock gesture but before the context runs or its
   * file is decoded (the first tap's `select`) is held, at most one, for up to `PENDING_MAX_MS`.
   */
  cue(name: CueName, opts?: { chain?: number }): void {
    this.flushPending();
    if (this.play(name, opts) !== 'not-ready') return;
    if (this.unlocked && !this.paused) this.pending = { name, opts, at: this.now() };
  }

  private flushPending(): void {
    const p = this.pending;
    if (!p) return;
    if (this.now() - p.at > PENDING_MAX_MS) {
      this.pending = null;
      return;
    }
    if (this.play(p.name, p.opts) !== 'not-ready') this.pending = null;
  }

  /** `not-ready`: the context isn't running yet, or the cue's file is still on its way. */
  private play(name: CueName, opts?: { chain?: number }): 'played' | 'skipped' | 'not-ready' {
    const ctx = this.ctx;
    if (!ctx || !this.unlocked || this.muted) return 'skipped';
    const base = (name.startsWith('match-chain-') ? 'match' : name) as ManifestCue;
    const spec = CUES[base];
    if (!spec) return 'skipped';
    if (ctx.state !== 'running') return 'not-ready';
    const chain = Math.max(0, Math.floor(opts?.chain ?? 0));
    let key: string;
    let semitones = 0;
    if (spec.variants) {
      const n = spec.variants;
      const picked = 1 + Math.floor(this.rng() * n);
      key = `${base}-${picked}`;
      for (let i = 0; i < n && !this.buffers.has(key); i++) key = `${base}-${1 + ((picked + i) % n)}`;
    } else if (spec.chainSet && chain > 0 && this.buffers.has(`${base}-chain-${Math.min(chain + 1, spec.chainSet)}`)) {
      key = `${base}-chain-${Math.min(chain + 1, spec.chainSet)}`;
    } else {
      key = name.startsWith('match-chain-') ? name : base;
      if (spec.chainSet) semitones = Math.min(chain, MAX_CHAIN_SEMITONES);
    }
    if (!this.buffers.has(key)) key = base;
    const buffer = this.buffers.get(key);
    if (!buffer) return this.inFlight > 0 ? 'not-ready' : 'skipped';

    const t = this.now();
    const last = this.lastStart.get(base);
    if (last !== undefined && t - last < spec.cooldownMs) return 'skipped';
    let voices = this.active.get(base);
    if (!voices) this.active.set(base, (voices = new Set()));
    if (voices.size >= spec.voices) return 'skipped';

    let src: AudioBufferSourceNode | null = null;
    try {
      src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = spec.loop ?? false;
      src.playbackRate.value = 2 ** (semitones / 12) * (1 + (this.rng() * 2 - 1) * PITCH_JITTER);
      const gain = ctx.createGain();
      gain.gain.value = dbToLinear(spec.gain + (this.rng() * 2 - 1) * GAIN_JITTER_DB);
      src.connect(gain);
      gain.connect(this.buses[spec.bus] ?? this.master ?? ctx.destination);
      const started = src;
      started.onended = () => {
        voices.delete(started);
        started.disconnect();
        gain.disconnect();
      };
      voices.add(started);
      started.start();
      this.lastStart.set(base, t);
      this.deps.onPlay?.(key);
      return 'played';
    } catch {
      if (src) voices.delete(src);
      return 'skipped';
    }
  }
}
