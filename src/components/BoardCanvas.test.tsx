/** @vitest-environment jsdom */
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import BoardCanvas, { GRAPHICS_FAILED } from './BoardCanvas';
import { useGame } from '../app/useGame';

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
});

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
});
