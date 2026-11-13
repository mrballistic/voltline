import { describe, expect, it, vi } from 'vitest';
import { AudioEngine } from './engine';
import { CUES } from './cues';
import type { CueName } from './cues';

class FakeParam { value = 1; }
class FakeNode {
  gain = new FakeParam();
  connect = vi.fn();
  disconnect = vi.fn();
}
class FakeSource extends FakeNode {
  buffer: unknown = null;
  loop = false;
  playbackRate = new FakeParam();
  onended: (() => void) | null = null;
  start = vi.fn();
}

function setup(files: string[] | 'all', opts: { webm?: boolean } = {}) {
  const sources: FakeSource[] = [];
  const ctx = {
    state: 'suspended' as 'suspended' | 'running',
    destination: {},
    createGain: () => new FakeNode(),
    createBufferSource: () => {
      const s = new FakeSource();
      sources.push(s);
      return s;
    },
    decodeAudioData: vi.fn(async (b: ArrayBuffer) => ({ tag: new TextDecoder().decode(b) })),
    resume: vi.fn(async () => { ctx.state = 'running'; }),
    suspend: vi.fn(async () => { ctx.state = 'suspended'; }),
  };
  const requested: string[] = [];
  const fetchFn = vi.fn(async (url: string) => {
    requested.push(url);
    const file = url.split('/').pop()!.replace(/\.(webm|m4a)$/, '');
    const ok = files === 'all' || files.includes(file);
    return { ok, status: ok ? 200 : 404, arrayBuffer: async () => new TextEncoder().encode(file).buffer };
  });
  let clock = 0;
  const engine = new AudioEngine({
    createContext: () => ctx as unknown as AudioContext,
    fetch: fetchFn as unknown as typeof fetch,
    base: './audio',
    rng: () => 0.5,
    now: () => clock,
    canPlayWebm: () => opts.webm ?? true,
  });
  return { engine, sources, ctx, requested, tick: (ms: number) => { clock += ms; } };
}

describe('AudioEngine', () => {
  it('missing files degrade to silence without throwing', async () => {
    const { engine, sources } = setup([]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(engine.load()).resolves.toBeUndefined();
    engine.unlock();
    expect(() => engine.cue('select')).not.toThrow();
    expect(sources).toHaveLength(0);
    warn.mockRestore();
  });

  it('picks the file format by canPlayType', async () => {
    const a = setup([], { webm: true });
    const b = setup([], { webm: false });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await a.engine.load();
    await b.engine.load();
    expect(a.requested.every((u) => u.endsWith('.webm'))).toBe(true);
    expect(b.requested.every((u) => u.endsWith('.m4a'))).toBe(true);
    expect(a.requested).toContain('./audio/land-3.webm');
    expect(a.requested).toContain('./audio/match-chain-5.webm');
    vi.restoreAllMocks();
  });

  it('cue is silent until unlock', async () => {
    const { engine, sources } = setup('all');
    await engine.load();
    engine.cue('select');
    expect(sources).toHaveLength(0);
    engine.unlock();
    await Promise.resolve();
    engine.cue('select');
    expect(sources).toHaveLength(1);
    expect(sources[0].start).toHaveBeenCalled();
  });

  it('voice limit and cooldown hold under a burst', async () => {
    const { engine, sources, tick } = setup('all');
    await engine.load();
    engine.unlock();
    for (let i = 0; i < 50; i++) {
      engine.cue('land');
      tick(0.2);
    }
    expect(sources.length).toBeLessThanOrEqual(3);
    expect(sources.length).toBeGreaterThan(0);
    // With the cooldown cleared, the voice cap still holds while sources keep playing.
    for (let i = 0; i < 10; i++) {
      tick(100);
      engine.cue('land');
    }
    expect(sources).toHaveLength(CUES.land.voices);
    // A finished voice frees a slot.
    sources[0].onended?.();
    tick(100);
    engine.cue('land');
    expect(sources).toHaveLength(CUES.land.voices + 1);
  });

  it('chain pitch rises a semitone per level capped at 7', async () => {
    const { engine, sources, tick } = setup(['match']);
    await engine.load();
    engine.unlock();
    const rates: number[] = [];
    for (const chain of [0, 1, 2, 7, 12]) {
      tick(100);
      engine.cue('match', { chain });
      rates.push(sources.at(-1)!.playbackRate.value);
    }
    // rng 0.5 gives zero jitter, so rates are exact.
    expect(rates[0]).toBeCloseTo(1);
    expect(rates[1]).toBeCloseTo(2 ** (1 / 12));
    expect(rates[2]).toBeCloseTo(2 ** (2 / 12));
    expect(rates[3]).toBeCloseTo(2 ** (7 / 12));
    expect(rates[4]).toBeCloseTo(2 ** (7 / 12));
  });

  it('chain set file preferred when present', async () => {
    const { engine, sources, tick } = setup(['match', 'match-chain-2', 'match-chain-5']);
    await engine.load();
    engine.unlock();
    engine.cue('match', { chain: 1 });
    expect((sources[0].buffer as { tag: string }).tag).toBe('match-chain-2');
    expect(sources[0].playbackRate.value).toBeCloseTo(1);
    tick(100);
    engine.cue('match', { chain: 9 });
    expect((sources[1].buffer as { tag: string }).tag).toBe('match-chain-5');
    tick(100);
    // chain 2 wants match-chain-3, which is not loaded: base file, pitched.
    engine.cue('match', { chain: 2 });
    expect((sources[2].buffer as { tag: string }).tag).toBe('match');
    expect(sources[2].playbackRate.value).toBeCloseTo(2 ** (2 / 12));
  });

  it('suspended context starts nothing and consumes no voice slots', async () => {
    const { engine, sources, ctx, tick } = setup('all');
    await engine.load();
    engine.unlock();
    engine.suspend();
    await Promise.resolve();
    for (let i = 0; i < 10; i++) { tick(100); engine.cue('land'); }
    expect(sources).toHaveLength(0);
    engine.resume();
    await Promise.resolve();
    expect(ctx.state).toBe('running');
    tick(100);
    engine.cue('land');
    expect(sources).toHaveLength(1);
  });

  it('unlock resumes a pre-created suspended context, and rejected resume is swallowed', async () => {
    const { engine, ctx, sources } = setup('all');
    await engine.load();
    expect(ctx.state).toBe('suspended');
    engine.unlock();
    await Promise.resolve();
    expect(ctx.resume).toHaveBeenCalled();
    expect(ctx.state).toBe('running');
    ctx.resume.mockRejectedValueOnce(new Error('nope'));
    engine.resume();
    await Promise.resolve();
    expect(sources).toHaveLength(0);
  });

  it('a missing variant falls back to another loaded one', async () => {
    const { engine, sources } = setup(['land-1', 'land-3']);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await engine.load();
    engine.unlock();
    await Promise.resolve();
    engine.cue('land'); // rng 0.5 picks land-2, which is missing
    expect(sources).toHaveLength(1);
    expect(['land-1', 'land-3']).toContain((sources[0].buffer as { tag: string }).tag);
    vi.restoreAllMocks();
  });

  it('muted plays nothing', async () => {
    const { engine, sources } = setup('all');
    await engine.load();
    engine.unlock();
    engine.setMuted(true);
    engine.cue('select');
    expect(sources).toHaveLength(0);
    engine.setMuted(false);
    engine.cue('select');
    expect(sources).toHaveLength(1);
  });
});

describe('CUES', () => {
  it('every cue name planned exists in CUES', async () => {
    const { planScript } = await import('../render/plan');
    const { newGame, applyMove, productiveMoves } = await import('../engine');
    let state = newGame(7);
    const names = new Set<CueName>();
    for (let i = 0; i < 40; i++) {
      const move = productiveMoves(state)[0];
      if (!move) break;
      const r = applyMove(state, move);
      for (const p of planScript(r.script, { timeScale: 1 }).items) {
        if (p.action.a === 'cue') names.add(p.action.name);
      }
      state = r.state;
    }
    expect(names.size).toBeGreaterThan(0);
    for (const n of names) {
      expect(n.startsWith('match-chain-') || n in CUES).toBe(true);
    }
  });
});
