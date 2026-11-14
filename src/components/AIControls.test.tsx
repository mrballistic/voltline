/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import AIControls from './AIControls';

afterEach(cleanup);

const props = { on: false, speed: 'medium' as const, moves: 1234, thinking: false, onToggle: () => {}, onSpeed: () => {} };

describe('AIControls', () => {
  it('shows the switch, speeds and move counter', () => {
    render(<AIControls {...props} />);
    expect(screen.getByRole('switch', { name: 'AI' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Medium' })).toHaveAttribute('aria-pressed', 'true');
    for (const name of ['Slow', 'Fast']) expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('AI moves 1,234')).toBeInTheDocument();
    expect(screen.getByText('Thinking…')).toHaveAttribute('aria-hidden', 'true');
  });

  it('switch and speed buttons call back; the pressed speed is kept', () => {
    const onToggle = vi.fn();
    const onSpeed = vi.fn();
    render(<AIControls {...props} onToggle={onToggle} onSpeed={onSpeed} />);
    fireEvent.click(screen.getByRole('switch', { name: 'AI' }));
    expect(onToggle).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: 'Fast' }));
    expect(onSpeed).toHaveBeenCalledWith('fast');
    fireEvent.click(screen.getByRole('button', { name: 'Medium' })); // already pressed: no deselect
    expect(onSpeed).toHaveBeenCalledTimes(1);
  });

  it('thinking indicator is exposed while ranking', () => {
    render(<AIControls {...props} on thinking />);
    expect(screen.getByRole('switch', { name: 'AI' })).toBeChecked();
    expect(screen.getByText('Thinking…')).toHaveAttribute('aria-hidden', 'false');
  });
});
