/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import type { UiSnapshot } from '../app/controller';
import Header from './Header';

afterEach(cleanup);

const base = {
  score: 1500, level: 2, levelProgress: 0.4, muted: false, volume: 0.8, aiOn: false, best: { player: 900, ai: 0 }, notice: null,
} as unknown as UiSnapshot;

describe('Header', () => {
  it('mute click calls setMuted and the icon state flips', () => {
    const onMuted = vi.fn();
    function Wrapper() {
      const [muted, setMuted] = useState(false);
      return <Header ui={{ ...base, muted }} onMuted={(m) => { onMuted(m); setMuted(m); }} onVolume={() => {}} />;
    }
    render(<Wrapper />);
    expect(screen.getByTestId('speaker-icon')).toHaveAttribute('data-muted', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
    expect(onMuted).toHaveBeenCalledWith(true);
    expect(screen.getByTestId('speaker-icon')).toHaveAttribute('data-muted', 'true');
    expect(screen.getByRole('button', { name: 'Unmute' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('gives the score an accessible name with the final value', () => {
    render(<Header ui={base} onMuted={() => {}} onVolume={() => {}} />);
    expect(screen.getByText('Score 1,500')).toBeInTheDocument();
  });

  it('shows the level-up line while the notice is set', () => {
    render(<Header ui={{ ...base, notice: { kind: 'level-up', level: 3 } }} onMuted={() => {}} onVolume={() => {}} />);
    expect(screen.getByText('Level 3!')).toBeInTheDocument();
  });
});
