/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import type { UiSnapshot } from '../app/controller';
import Header from './Header';

afterEach(cleanup);

const base = {
  score: 1500, level: 2, levelProgress: 0.4, muted: false, aiOn: false, best: { player: 900, ai: 0 }, notice: null,
} as unknown as UiSnapshot;

describe('Header', () => {
  it('mute keeps the name “Mute”, toggles aria-pressed, and the icon state flips', () => {
    const onMuted = vi.fn();
    function Wrapper() {
      const [muted, setMuted] = useState(false);
      return <Header ui={{ ...base, muted }} onMuted={(m) => { onMuted(m); setMuted(m); }} />;
    }
    render(<Wrapper />);
    expect(screen.getByTestId('speaker-icon')).toHaveAttribute('data-muted', 'false');
    expect(screen.getByRole('button', { name: 'Mute' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
    expect(onMuted).toHaveBeenCalledWith(true);
    expect(screen.getByTestId('speaker-icon')).toHaveAttribute('data-muted', 'true');
    // The name never flips to “Unmute”: with aria-pressed that would read as “Unmute, pressed”.
    expect(screen.queryByRole('button', { name: 'Unmute' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Mute' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
    expect(onMuted).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('button', { name: 'Mute' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows the logo mark hidden from assistive tech; the heading is still the name', () => {
    render(<Header ui={base} onMuted={() => {}} />);
    const heading = screen.getByRole('heading', { level: 1, name: 'Voltline' });
    // One word for a screen reader: the kerned V is an inline span, not a separate word.
    expect(heading.textContent).toBe('Voltline');
    expect(heading).not.toHaveAttribute('aria-label');
    const mark = screen.getByTestId('logo-mark');
    expect(mark).toHaveAttribute('aria-hidden', 'true');
    expect(mark.tagName.toLowerCase()).toBe('svg');
  });

  it('has a single sound control: the mute button, no volume slider', () => {
    render(<Header ui={base} onMuted={() => {}} />);
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Mute' })).toBeInTheDocument();
  });

  it('gives the score an accessible name with the final value', () => {
    render(<Header ui={base} onMuted={() => {}} />);
    expect(screen.getByText('Score 1,500')).toBeInTheDocument();
  });

  it('shows the level-up line while the notice is set', () => {
    render(<Header ui={{ ...base, notice: { kind: 'level-up', level: 3 } }} onMuted={() => {}} />);
    expect(screen.getByText('Level 3!')).toBeInTheDocument();
  });
});
