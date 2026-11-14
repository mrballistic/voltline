/** @vitest-environment jsdom */
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import BoardCanvas, { GRAPHICS_FAILED } from './BoardCanvas';
import { useGame } from '../app/useGame';
import { computeLayout } from '../render/layout';

const createGame = vi.fn();
vi.mock('../app/bootstrap', () => ({ createGame: (...args: unknown[]) => createGame(...args) }));

function Harness() {
  const host = useRef<HTMLDivElement>(null);
  const { failed } = useGame(host, 1);
  return <BoardCanvas host={host} failed={failed} />;
}

afterEach(() => {
  cleanup();
  createGame.mockReset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Fakes the host's size and a ResizeObserver whose callback the test fires. */
function fakeHostSize(size: { w: number; h: number }) {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => size.w);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => size.h);
  const observers: (() => void)[] = [];
  vi.stubGlobal('ResizeObserver', class {
    constructor(private readonly cb: () => void) { observers.push(() => this.cb()); }
    observe() {}
    disconnect() {}
  });
  return { resize: (w: number, h: number) => { size.w = w; size.h = h; observers.forEach((f) => f()); } };
}

function Bare({ failed = false }: { failed?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  return <div data-testid="column"><BoardCanvas host={host} failed={failed} /></div>;
}

describe('BoardCanvas', () => {
  it('shows a short message in the canvas area when the graphics fail to start', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    createGame.mockRejectedValue(new Error('no WebGL'));
    render(<Harness />);
    expect((await screen.findByRole('alert')).textContent).toBe('Voltline couldn’t start the graphics. Try another browser.');
    expect(GRAPHICS_FAILED).toContain('couldn’t');
    error.mockRestore();
  });

  it('shows no message while the game runs, and destroys it on unmount', async () => {
    const destroy = vi.fn();
    createGame.mockResolvedValue({ controller: { snapshot: () => null }, destroy });
    const { unmount } = render(<Harness />);
    await vi.waitFor(() => expect(createGame).toHaveBeenCalled());
    await Promise.resolve();
    expect(screen.queryByRole('alert')).toBeNull();
    unmount();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('publishes the board width as --vl-board-px on the app column, and follows resizes', async () => {
    const host = fakeHostSize({ w: 390, h: 452 });
    render(<Bare />);
    const column = screen.getByTestId('column');
    expect(column.style.getPropertyValue('--vl-board-px')).toBe(`${computeLayout(390, 452).board.size}px`);
    host.resize(1440, 528);
    await vi.waitFor(() => expect(column.style.getPropertyValue('--vl-board-px')).toBe(`${computeLayout(1440, 528).board.size}px`));
  });
});
