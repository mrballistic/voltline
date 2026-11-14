/** @vitest-environment jsdom */
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import GameControls from './GameControls';
import HowToPlayDialog from './HowToPlayDialog';

afterEach(cleanup);

function Harness({ spies }: { spies: Record<'onHint' | 'onNewGame', () => void> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <GameControls hintDisabled={false} over={false} onHowToPlay={() => setOpen(true)} {...spies} />
      <HowToPlayDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

describe('HowToPlayDialog', () => {
  it('the button opens the dialog with the 1.1 rules in curly copy', () => {
    render(<Harness spies={{ onHint: vi.fn(), onNewGame: vi.fn() }} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'How to play' }));
    expect(screen.getByRole('dialog', { name: 'How to play' })).toBeInTheDocument();
    expect(screen.getByText(/Every 10 pieces of one color you clear/)).toBeInTheDocument();
    expect(screen.getByText(/counting pauses while it’s full/)).toBeInTheDocument();
    expect(screen.getByText(/From level 5, gray rocks/)).toBeInTheDocument();
    expect(screen.getByText(/Past level 8, refills get harder/)).toBeInTheDocument();
    expect(screen.getByRole('dialog').textContent).not.toMatch(/['"]/);
  });

  it('Got it and Esc close it, and no game action fires', async () => {
    const spies = { onHint: vi.fn(), onNewGame: vi.fn() };
    render(<Harness spies={spies} />);
    fireEvent.click(screen.getByRole('button', { name: 'How to play' }));
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'How to play' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(spies.onHint).not.toHaveBeenCalled();
    expect(spies.onNewGame).not.toHaveBeenCalled();
  });
});
