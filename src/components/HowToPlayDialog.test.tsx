/** @vitest-environment jsdom */
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import GameControls from './GameControls';
import { ROCK_START_LEVEL, STINGY_START_LEVEL, TRAY_CAPACITY, TRAY_THRESHOLD } from '../engine/rules';
import HowToPlayDialog, { numberWord } from './HowToPlayDialog';

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
    const dialog = screen.getByRole('dialog');
    // Derived from the rules, so a rules change updates the copy...
    expect(dialog).toHaveTextContent(`Every ${TRAY_THRESHOLD} pieces of one color you clear`);
    expect(dialog).toHaveTextContent(`The tray holds ${numberWord(TRAY_CAPACITY)}, and counting pauses while it’s full`);
    expect(dialog).toHaveTextContent(`From level ${ROCK_START_LEVEL}, gray rocks`);
    expect(dialog).toHaveTextContent(`Past level ${STINGY_START_LEVEL - 1}, refills get harder`);
    // ...and today's exact numbers, so a rules change fails here until the copy is reviewed.
    expect(dialog).toHaveTextContent('Every 10 pieces of one color you clear');
    expect(dialog).toHaveTextContent('The tray holds five');
    expect(dialog).toHaveTextContent('From level 5, gray rocks');
    expect(dialog).toHaveTextContent('Past level 8, refills get harder');
    expect(dialog).toHaveTextContent('or with a rock to clear every rock.');
    expect(dialog).toHaveTextContent('Match four or more and they explode like a Charge.');
    expect(dialog).toHaveTextContent('A Prism swapped with a rock clears every rock on the board.');
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

  it('returns focus to the How to play button on close', async () => {
    render(<Harness spies={{ onHint: vi.fn(), onNewGame: vi.fn() }} />);
    const button = screen.getByRole('button', { name: 'How to play' });
    button.focus();
    fireEvent.click(button);
    expect(screen.getByRole('button', { name: 'Got it' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(button).toHaveFocus();
  });

  it('shows a bottom fade, and a top fade only once scrolled', () => {
    render(<HowToPlayDialog open onClose={() => {}} />);
    expect(screen.getByTestId('how-to-play-fade-bottom')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByTestId('how-to-play-fade-top')).toBeNull();
    const content = screen.getByTestId('how-to-play-content');
    content.scrollTop = 120;
    fireEvent.scroll(content);
    expect(screen.getByTestId('how-to-play-fade-top')).toHaveAttribute('aria-hidden', 'true');
    content.scrollTop = 0;
    fireEvent.scroll(content);
    expect(screen.queryByTestId('how-to-play-fade-top')).toBeNull();
  });
});
