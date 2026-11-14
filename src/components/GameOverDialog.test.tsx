/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import GameOverDialog from './GameOverDialog';

afterEach(cleanup);

describe('GameOverDialog', () => {
  it('GameOverDialog shows score, level and best with curly copy', () => {
    const onPlayAgain = vi.fn();
    render(<GameOverDialog open score={1234} level={5} best={2000} newBest={false} ai={false} onPlayAgain={onPlayAgain} />);
    expect(screen.getByText('No moves left')).toBeInTheDocument();
    expect(screen.getByText('Score 1,234')).toBeInTheDocument();
    expect(screen.getByText('Level 5')).toBeInTheDocument();
    expect(screen.getByText('Best 2,000')).toBeInTheDocument();
    expect(screen.queryByText('New best!')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
    expect(onPlayAgain).toHaveBeenCalledOnce();
  });

  it('GameOverDialog labels AI best for AI games', () => {
    render(<GameOverDialog open score={10} level={1} best={10} newBest ai onPlayAgain={() => {}} />);
    expect(screen.getByText('AI best 10')).toBeInTheDocument();
    expect(screen.getByText('New best!')).toBeInTheDocument();
  });

  it('a tie shows no New best!, a strictly higher score does', () => {
    const { rerender } = render(<GameOverDialog open score={500} level={2} best={500} newBest={false} ai={false} onPlayAgain={() => {}} />);
    expect(screen.queryByText('New best!')).toBeNull();
    rerender(<GameOverDialog open score={501} level={2} best={501} newBest ai={false} onPlayAgain={() => {}} />);
    expect(screen.getByText('New best!')).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    render(<GameOverDialog open={false} score={0} level={1} best={0} newBest={false} ai={false} onPlayAgain={() => {}} />);
    expect(screen.queryByText('No moves left')).toBeNull();
  });

  it('focuses Play again, and Escape does not close it', async () => {
    render(<GameOverDialog open score={10} level={1} best={10} newBest={false} ai={false} onPlayAgain={() => {}} />);
    const play = screen.getByRole('button', { name: 'Play again' });
    expect(play).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByRole('dialog', { name: 'No moves left' })).toBeInTheDocument();
  });

  it('is a 300 px centered column', () => {
    render(<GameOverDialog open score={10} level={1} best={10} newBest={false} ai={false} onPlayAgain={() => {}} />);
    const paper = screen.getByRole('dialog');
    const style = getComputedStyle(paper);
    expect(style.width).toBe('300px');
    expect(style.flexDirection).toBe('column');
    expect(style.alignItems).toBe('center');
  });
});
