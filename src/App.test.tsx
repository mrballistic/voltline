/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { UiSnapshot } from './app/controller';
import { CONSENT_KEY, resetConsentState } from './app/consent';

const game = vi.hoisted(() => ({ ui: null as unknown, failed: false }));
vi.mock('./app/useGame', () => ({
  useGame: () => ({
    ui: game.ui, failed: game.failed,
    actions: { newGame() {}, hint() {}, uiClick() {}, setAI() {}, setAISpeed() {}, setMuted() {} },
  }),
}));
const { default: App } = await import('./App');

const idle = {
  score: 0, level: 1, levelProgress: 0, tray: [], trayFull: false, moves: 0, over: false, busy: false, selected: null,
  selectedSlot: null, aiOn: false, aiSpeed: 'medium', aiMoves: 0, aiThinking: false, muted: false,
  newBest: false, overAI: false, best: { player: 0, ai: 0 }, notice: null,
} satisfies UiSnapshot;

afterEach(() => {
  cleanup();
  game.ui = null;
  game.failed = false;
  localStorage.clear();
  resetConsentState();
  document.head.querySelectorAll('script[src*="googletagmanager"]').forEach((s) => s.remove());
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
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

  it('pins the footer to the bottom and gives its links a 28 px target', () => {
    game.ui = idle;
    render(<App />);
    const footer = screen.getByRole('contentinfo');
    expect(getComputedStyle(footer).marginTop).toBe('auto');
    for (const link of [
      ...['Credits', 'MIT License', 'Mac app'].map((name) => screen.getByRole('link', { name })),
      screen.getByRole('button', { name: 'Cookie settings' }),
    ]) {
      expect(getComputedStyle(link).display).toBe('inline-block');
      expect(getComputedStyle(link).padding).toBe('6px 2px');
    }
  });

  it('the footer reads Credits · MIT License · Mac app · Cookie settings', () => {
    game.ui = idle;
    render(<App />);
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Credits · MIT License · Mac app · Cookie settings');
    const mac = screen.getByRole('link', { name: 'Mac app' });
    expect(mac).toHaveAttribute('href', 'https://github.com/mrballistic/voltline/releases/latest');
    expect(mac).toHaveAttribute('target', '_blank');
    expect(mac).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('shows the cookie banner on a first visit, and Cookie settings reopens it after an answer', () => {
    game.ui = idle;
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    expect(screen.queryByRole('region', { name: 'Analytics cookies' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cookie settings' }));
    expect(screen.getByRole('region', { name: 'Analytics cookies' })).toBeInTheDocument();
  });

  it('puts the cookie banner in the column between the AI dock and the footer', () => {
    game.ui = idle;
    render(<App />);
    const dock = screen.getByRole('group', { name: 'AI mode' });
    const region = screen.getByRole('region', { name: 'Analytics cookies' });
    const footer = screen.getByRole('contentinfo');
    expect(dock.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(region.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(region.parentElement).toBe(footer.parentElement);
  });

  it('in the desktop app: no banner, no Mac app or Cookie settings, no tag', () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    localStorage.setItem(CONSENT_KEY, 'granted');
    game.ui = idle;
    render(<App />);
    expect(screen.getByRole('contentinfo')).toHaveTextContent(/^Credits · MIT License$/);
    expect(screen.queryByRole('link', { name: 'Mac app' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cookie settings' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Analytics cookies' })).toBeNull();
    expect(document.head.querySelectorAll('script[src*="googletagmanager"]')).toHaveLength(0);
  });
});
