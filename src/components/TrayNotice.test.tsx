/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import TrayNotice from './TrayNotice';

const TEXT = 'Tray full—spend one to free a slot.';

function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)', media: query,
    addEventListener: () => {}, removeEventListener: () => {},
  }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('TrayNotice', () => {
  it('TrayNotice renders the full message only when trayFull', () => {
    const { rerender } = render(<TrayNotice trayFull={false} />);
    expect(screen.queryByText(TEXT)).toBeNull();
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    rerender(<TrayNotice trayFull />);
    expect(screen.getByText(TEXT)).toBeInTheDocument();
  });

  it('fades the message out before clearing it; the live region stays mounted', () => {
    vi.useFakeTimers();
    const { rerender } = render(<TrayNotice trayFull />);
    const region = screen.getByRole('status');
    rerender(<TrayNotice trayFull={false} />);
    // Still there for the fade, but transparent.
    expect(screen.getByText(TEXT)).toHaveStyle({ opacity: '0' });
    act(() => { vi.advanceTimersByTime(150); });
    expect(screen.queryByText(TEXT)).toBeNull();
    expect(screen.getByRole('status')).toBe(region);
  });

  it('with reduced motion, clears the message at once', () => {
    mockReducedMotion(true);
    const { rerender } = render(<TrayNotice trayFull />);
    rerender(<TrayNotice trayFull={false} />);
    expect(screen.queryByText(TEXT)).toBeNull();
  });
});
