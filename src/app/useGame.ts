// React's view of the game: creates it inside `host`, mirrors the controller's UiSnapshot, and
// exposes the actions. Everything the Pixi side owns stays out of React state.
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { createGame } from './bootstrap';
import type { GameController, UiSnapshot } from './controller';
import type { AISpeed } from './ports';

export interface GameActions {
  newGame(): void;
  hint(): void;
  uiClick(): void;
  setAI(on: boolean): void;
  setAISpeed(s: AISpeed): void;
  setMuted(m: boolean): void;
  setVolume(v: number): void;
}

export function useGame(host: RefObject<HTMLElement | null>, seed?: number) {
  const [ui, setUi] = useState<UiSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const controller = useRef<GameController | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let destroy: (() => void) | null = null;
    // init is async: if we unmount first, tear the game down as soon as it exists.
    createGame(el, { seed, onChange: (s) => { if (!disposed) setUi(s); } }).then(
      (game) => {
        if (disposed) {
          game.destroy();
          return;
        }
        controller.current = game.controller;
        destroy = () => game.destroy();
        setUi(game.controller.snapshot());
      },
      (err: unknown) => {
        console.error('Voltline failed to start', err);
        if (!disposed) setFailed(true);
      },
    );
    return () => {
      disposed = true;
      controller.current = null;
      destroy?.();
    };
  }, [host, seed]);

  const call = useCallback(<T,>(f: (c: GameController) => T) => {
    const c = controller.current;
    if (c) f(c);
  }, []);

  const actions = useMemo<GameActions>(() => ({
    newGame: () => call((c) => void c.newGame()),
    hint: () => call((c) => void c.hint()),
    uiClick: () => call((c) => c.uiClick()),
    setAI: (on) => call((c) => c.setAI(on)),
    setAISpeed: (s) => call((c) => c.setAISpeed(s)),
    setMuted: (m) => call((c) => c.setMuted(m)),
    setVolume: (v) => call((c) => c.setVolume(v)),
  }), [call]);

  return { ui, actions, failed };
}
