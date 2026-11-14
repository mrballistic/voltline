import { CUES, type CueName, type CueSink, type CueSpec, type ManifestCue } from './cues';

export interface AudioEngineDeps {
  createContext: () => AudioContext;
  fetch: typeof fetch;
  /** URL prefix the encoded files live under, e.g. `./audio` (no trailing slash). */
  base: string;
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

const dbToLinear = (db: number): number => 10 ** (db / 20);

function probeWebm(): boolean {
  try {
    return new Audio().canPlayType('audio/webm; codecs="opus"') !== '';
  } catch {
    return false;
  }
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

  /** File keys (without extension) for every cue, variant and chain file. */
  private fileKeys(): string[] {
    const keys: string[] = [];
    for (const [name, spec] of Object.entries(CUES) as [ManifestCue, CueSpec][]) {
      if (spec.variants) for (let i = 1; i <= spec.variants; i++) keys.push(`${name}-${i}`);
      else keys.push(name);
      if (spec.chainSet) for (let i = 1; i <= spec.chainSet; i++) keys.push(`${name}-chain-${i}`);
    }
    return keys;
  }

  /** Fetches and decodes every file. Missing or undecodable files are skipped. */
  async load(): Promise<void> {
    const ctx = this.context();
    if (!ctx) return;
    const ext = (this.deps.canPlayWebm ?? probeWebm)() ? 'webm' : 'm4a';
    await Promise.all(
      this.fileKeys().map(async (key) => {
        const url = `${this.deps.base}/${key}.${ext}`;
        try {
          const res = await this.deps.fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
          if (!this.disposed) this.buffers.set(key, buffer);
        } catch {
          if (import.meta.env.DEV && !this.disposed) console.warn(`[audio] missing or undecodable: ${url}`);
        }
      }),
    );
  }

  /** Call from the first pointerdown/keydown; browsers keep the context suspended until then. */
  unlock(): void {
    const ctx = this.context();
    if (!ctx) return;
    this.unlocked = true;
    ctx.resume?.()?.catch(() => {});
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

  suspend(): void {
    this.ctx?.suspend?.()?.catch(() => {});
  }

  resume(): void {
    if (this.unlocked) this.ctx?.resume?.()?.catch(() => {});
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
    this.active.clear();
    ctx?.close?.()?.catch(() => {});
  }

  cue(name: CueName, opts?: { chain?: number }): void {
    const ctx = this.ctx;
    if (!ctx || !this.unlocked || this.muted || ctx.state !== 'running') return;
    const base = (name.startsWith('match-chain-') ? 'match' : name) as ManifestCue;
    const spec = CUES[base];
    if (!spec) return;

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
    if (!buffer) return;

    const t = this.now();
    const last = this.lastStart.get(base);
    if (last !== undefined && t - last < spec.cooldownMs) return;
    let voices = this.active.get(base);
    if (!voices) this.active.set(base, (voices = new Set()));
    if (voices.size >= spec.voices) return;

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
    } catch {
      if (src) voices.delete(src);
    }
  }
}
