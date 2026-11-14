/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { UiSnapshot } from './app/controller';

const game = vi.hoisted(() => ({ ui: null as unknown, failed: false }));
vi.mock('./app/useGame', () => ({
  useGame: () => ({
    ui: game.ui, failed: game.failed,
    actions: { newGame() {}, hint() {}, uiClick() {}, setAI() {}, setAISpeed() {}, setMuted() {}, setVolume() {} },
  }),
}));
const { default: App } = await import('./App');

const idle = {
  score: 0, level: 1, levelProgress: 0, tray: [], trayFull: false, moves: 0, over: false, busy: false, selected: null,
  selectedSlot: null, aiOn: false, aiSpeed: 'medium', aiMoves: 0, aiThinking: false, muted: false, volume: 0.8,
  newBest: false, overAI: false, best: { player: 0, ai: 0 }, notice: null,
} satisfies UiSnapshot;

afterEach(() => {
  cleanup();
  game.ui = null;
  game.failed = false;
});

describe('App', () => {
  it('Hint is enabled on an idle board', () => {
    game.ui = idle;
    render(<App />);
    expect(screen.getByRole('button', { name: 'Hint' })).toBeEnabled();
  });

  it('when the graphics fail, Hint and the AI switch are disabled', () => {
    game.ui = idle;
    game.failed = true;
    render(<App />);
    expect(screen.getByRole('button', { name: 'Hint' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'AI' })).toBeDisabled();
  });

  it('renders the AI dock as its own block after the button row', () => {
    game.ui = idle;
    render(<App />);
    const newGame = screen.getByRole('button', { name: 'New game' });
    const dock = screen.getByRole('group', { name: 'AI mode' });
    expect(newGame.compareDocumentPosition(dock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(dock.contains(newGame)).toBe(false);
  });
});
