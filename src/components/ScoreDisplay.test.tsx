/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import ScoreDisplay from './ScoreDisplay';

function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)', media: query,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
    onchange: null, dispatchEvent: () => false,
  }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The digits a sighted player sees (the count-up), as opposed to the hidden accessible name. */
const shown = () => screen.getByText((_, el) => el?.getAttribute('aria-hidden') === 'true' && el.tagName === 'SPAN').textContent;

describe('ScoreDisplay', () => {
  it('with reduced motion, shows the new score at once, with no animation frames', () => {
    mockReducedMotion(true);
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    const { rerender } = render(<ScoreDisplay score={0} />);
    rerender(<ScoreDisplay score={1500} />);
    expect(shown()).toBe('1,500');
    expect(raf).not.toHaveBeenCalled();
    expect(screen.getByText('Score 1,500')).toBeInTheDocument();
  });

  it('without reduced motion, counts up over frames to the new score', async () => {
    mockReducedMotion(false);
    const { rerender } = render(<ScoreDisplay score={0} />);
    rerender(<ScoreDisplay score={1500} />);
    expect(shown()).toBe('0');
    await act(() => new Promise((r) => setTimeout(r, 600)));
    expect(shown()).toBe('1,500');
  });
});
