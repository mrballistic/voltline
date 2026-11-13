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

  it('renders nothing when closed', () => {
    render(<GameOverDialog open={false} score={0} level={1} best={0} newBest={false} ai={false} onPlayAgain={() => {}} />);
    expect(screen.queryByText('No moves left')).toBeNull();
  });
});
