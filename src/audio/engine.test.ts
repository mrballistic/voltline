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

type CtxState = 'suspended' | 'running' | 'closed' | 'interrupted';

/** Lets every pending promise (fetch, decode, resume) run. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function setup(files: string[] | 'all', opts: { webm?: boolean; onPlay?: (key: string) => void } = {}) {
  const sources: FakeSource[] = [];
  const ctx = {
    state: 'suspended' as CtxState,
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
    close: vi.fn(async () => { ctx.state = 'closed'; }),
  };
  const requested: string[] = [];
  const fetchFn = vi.fn(async (url: string) => {
    requested.push(url);
    const file = url.split('/').pop()!.replace(/\.(webm|m4a)$/, '');
    const ok = files === 'all' || files.includes(file);
    return { ok, status: ok ? 200 : 404, arrayBuffer: async () => new TextEncoder().encode(file).buffer };
  });
  let clock = 0;
  let contexts = 0;
  const engine = new AudioEngine({
    createContext: () => {
      contexts++;
      return ctx as unknown as AudioContext;
    },
    fetch: fetchFn as unknown as typeof fetch,
    base: './audio',
    rng: () => 0.5,
    now: () => clock,
    canPlayWebm: () => opts.webm ?? true,
    onPlay: opts.onPlay,
  });
  /** Loads, unlocks as a gesture would, and lets the resume and every decode settle. */
  const ready = async () => {
    await engine.load();
    engine.unlock();
    await settle();
  };
  /** Makes the next resume wait until the returned function is called. */
  const holdResume = () => {
    let release = () => {};
    ctx.resume.mockImplementationOnce(() => new Promise<void>((resolve) => {
      release = () => { ctx.state = 'running'; resolve(); };
    }));
    return () => release();
  };
  return {
    engine, sources, ctx, requested, ready, holdResume,
    contexts: () => contexts, tick: (ms: number) => { clock += ms; },
  };
}

const tagOf = (s: FakeSource) => (s.buffer as { tag: string }).tag;

describe('AudioEngine', () => {
  it('missing files degrade to silence without throwing', async () => {
    const { engine, sources } = setup([]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(engine.load()).resolves.toBeUndefined();
    engine.unlock();
    await settle();
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

  it('no context exists before the first gesture: load only fetches', async () => {
    const { engine, ctx, contexts, requested } = setup('all');
    await engine.load();
    expect(requested.length).toBeGreaterThan(0);
    expect(contexts()).toBe(0);
    expect(engine.state).toBe('none');
    expect(ctx.decodeAudioData).not.toHaveBeenCalled();
    engine.cue('select');
    engine.resume(); // a visibility change before any gesture creates nothing either
    expect(contexts()).toBe(0);
  });

  it('unlock creates the context once, resumes it and decodes what load fetched', async () => {
    const { engine, ctx, contexts, requested } = setup('all');
    await engine.load();
    engine.unlock();
    expect(contexts()).toBe(1);
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    await settle();
    expect(engine.state).toBe('running');
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(requested.length);
    engine.unlock(); // running already: nothing more
    expect(contexts()).toBe(1);
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(requested.length);
  });

  it('a gesture before load finishes decodes each file as it arrives', async () => {
    const { engine, sources, ctx } = setup(['select']);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loading = engine.load();
    engine.unlock();
    await loading;
    await settle();
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(1);
    engine.cue('select');
    expect(sources).toHaveLength(1);
    vi.restoreAllMocks();
  });

  it('an undecodable file warns once and is skipped', async () => {
    const { engine, ctx, sources } = setup(['select', 'swap']);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    ctx.decodeAudioData.mockImplementation(async (b: ArrayBuffer) => {
      const tag = new TextDecoder().decode(b);
      if (tag === 'swap') throw new Error('bad data');
      return { tag };
    });
    await engine.load();
    const fetchWarnings = warn.mock.calls.length;
    engine.unlock();
    await settle();
    expect(warn.mock.calls.slice(fetchWarnings).map((c) => String(c[0]))).toEqual(['[audio] missing or undecodable: ./audio/swap.webm']);
    engine.cue('swap');
    engine.cue('select');
    expect(sources.map(tagOf)).toEqual(['select']);
    warn.mockRestore();
  });

  it('cue is silent until unlock', async () => {
    const { engine, sources } = setup('all');
    await engine.load();
    engine.cue('select');
    expect(sources).toHaveLength(0);
    engine.unlock();
    await settle();
    expect(sources).toHaveLength(0); // a cue from before the gesture is never held
    engine.cue('select');
    expect(sources).toHaveLength(1);
    expect(sources[0].start).toHaveBeenCalled();
  });

  it('the first tap’s cue plays once, after resume settles', async () => {
    const { engine, sources, holdResume } = setup('all');
    await engine.load();
    const release = holdResume();
    engine.unlock();
    engine.cue('select'); // the tap's own cue, while the context is still starting
    await settle();
    expect(sources).toHaveLength(0);
    release();
    await settle();
    expect(sources.map(tagOf)).toEqual(['select']);
    engine.cue('swap');
    await settle();
    expect(sources.map(tagOf)).toEqual(['select', 'swap']); // played once, never again
  });

  it('only the latest early cue is held, and only for 300 ms', async () => {
    const a = setup('all');
    await a.engine.load();
    const releaseA = a.holdResume();
    a.engine.unlock();
    a.engine.cue('select');
    a.engine.cue('tray-pick');
    releaseA();
    await settle();
    expect(a.sources.map(tagOf)).toEqual(['tray-pick']);

    const b = setup('all');
    await b.engine.load();
    const releaseB = b.holdResume();
    b.engine.unlock();
    b.engine.cue('select');
    b.tick(301);
    releaseB();
    await settle();
    expect(b.sources).toHaveLength(0);
  });

  it('a cue waiting on its file plays as soon as it is decoded', async () => {
    const { engine, sources, ctx } = setup('all');
    await engine.load();
    let decoded = () => {};
    const gate = new Promise<void>((resolve) => { decoded = resolve; });
    ctx.decodeAudioData.mockImplementation(async (b: ArrayBuffer) => {
      await gate;
      return { tag: new TextDecoder().decode(b) };
    });
    engine.unlock();
    await settle();
    expect(engine.state).toBe('running');
    engine.cue('select');
    expect(sources).toHaveLength(0);
    decoded();
    await settle();
    expect(sources.map(tagOf)).toEqual(['select']);
  });

  it('voice limit and cooldown hold under a burst', async () => {
    const { engine, sources, tick, ready } = setup('all');
    await ready();
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
    const { engine, sources, tick, ready } = setup(['match']);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await ready();
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
    vi.restoreAllMocks();
  });

  it('chain set file preferred when present', async () => {
    const { engine, sources, tick, ready } = setup(['match', 'match-chain-2', 'match-chain-5']);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await ready();
    engine.cue('match', { chain: 1 });
    expect(tagOf(sources[0])).toBe('match-chain-2');
    expect(sources[0].playbackRate.value).toBeCloseTo(1);
    tick(100);
    engine.cue('match', { chain: 9 });
    expect(tagOf(sources[1])).toBe('match-chain-5');
    tick(100);
    // chain 2 wants match-chain-3, which is not loaded: base file, pitched.
    engine.cue('match', { chain: 2 });
    expect(tagOf(sources[2])).toBe('match');
    expect(sources[2].playbackRate.value).toBeCloseTo(2 ** (2 / 12));
    vi.restoreAllMocks();
  });

  it('suspended context starts nothing, consumes no voice slots and holds nothing', async () => {
    const { engine, sources, ctx, tick, ready } = setup('all');
    await ready();
    engine.suspend();
    await settle();
    for (let i = 0; i < 10; i++) { tick(100); engine.cue('land'); }
    expect(sources).toHaveLength(0);
    engine.resume();
    await settle();
    expect(ctx.state).toBe('running');
    expect(sources).toHaveLength(0); // nothing cued while hidden plays on return
    tick(100);
    engine.cue('land');
    expect(sources).toHaveLength(1);
  });

  it('a later gesture resumes a context that stopped running, and a rejected resume is swallowed', async () => {
    const { engine, ctx, contexts, sources, ready } = setup('all');
    await ready();
    ctx.state = 'interrupted'; // iOS: a call or Siri took the audio session
    engine.cue('select');
    engine.unlock();
    await settle();
    expect(ctx.state).toBe('running');
    expect(contexts()).toBe(1);
    expect(sources.map(tagOf)).toEqual(['select']);
    ctx.state = 'suspended';
    ctx.resume.mockRejectedValueOnce(new Error('nope'));
    engine.resume();
    await settle();
    expect(sources).toHaveLength(1);
  });

  it('a tab shown again before its suspend settles still asks the context to resume', async () => {
    const { engine, ctx, ready } = setup('all');
    await ready();
    let settleSuspend = () => {};
    ctx.suspend.mockImplementationOnce(() => new Promise<void>((resolve) => {
      settleSuspend = () => { ctx.state = 'suspended'; resolve(); };
    }));
    engine.suspend();
    engine.resume(); // the context still reads 'running' here
    settleSuspend();
    await settle();
    expect(ctx.resume).toHaveBeenCalledTimes(2);
  });

  it('a missing variant falls back to another loaded one', async () => {
    const { engine, sources, ready } = setup(['land-1', 'land-3']);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await ready();
    engine.cue('land'); // rng 0.5 picks land-2, which is missing
    expect(sources).toHaveLength(1);
    expect(['land-1', 'land-3']).toContain(tagOf(sources[0]));
    vi.restoreAllMocks();
  });

  it('muted plays nothing, and holds nothing for later', async () => {
    const { engine, sources, ready } = setup('all');
    await ready();
    engine.setMuted(true);
    engine.cue('select');
    engine.setMuted(false);
    await settle();
    expect(sources).toHaveLength(0);
    engine.cue('select');
    expect(sources).toHaveLength(1);
  });
});

describe('AudioEngine lifecycle', () => {
  it('reports its context state, none before one exists', async () => {
    const { engine, ready } = setup('all');
    expect(engine.state).toBe('none');
    await ready();
    expect(engine.state).toBe('running');
  });

  it('onPlay names each file that starts, and only those', async () => {
    const played: string[] = [];
    const { engine, tick, ready } = setup(['select', 'land-1', 'land-2', 'land-3', 'match', 'match-chain-3'], { onPlay: (k) => played.push(k) });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await engine.load();
    engine.cue('select'); // locked: nothing starts
    await ready();
    engine.cue('select');
    engine.cue('land');
    engine.cue('match', { chain: 2 });
    tick(100);
    engine.cue('swap'); // not loaded
    expect(played).toEqual(['select', 'land-2', 'match-chain-3']);
    vi.restoreAllMocks();
  });

  it('dispose closes the context; afterwards every call is a silent no-op', async () => {
    const { engine, ctx, sources, contexts, ready } = setup('all');
    await ready();
    engine.dispose();
    expect(ctx.close).toHaveBeenCalledTimes(1);
    engine.cue('select');
    engine.unlock();
    engine.resume();
    engine.suspend();
    engine.dispose();
    await engine.load();
    expect(sources).toHaveLength(0);
    expect(contexts()).toBe(1);
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(ctx.close).toHaveBeenCalledTimes(1);
    expect(engine.state).toBe('none');
  });

  it('a load or decode cut short by dispose warns about nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a = setup('all');
    a.ctx.decodeAudioData.mockImplementation(async () => { throw new Error('context closed'); });
    await a.engine.load();
    a.engine.unlock();
    a.engine.dispose();
    await settle();

    const b = setup([]);
    const loading = b.engine.load();
    b.engine.dispose();
    await loading;
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
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
