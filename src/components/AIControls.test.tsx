/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AIControls from './AIControls';

afterEach(cleanup);

const props = { on: false, speed: 'medium' as const, moves: 1234, thinking: false, onToggle: () => {}, onSpeed: () => {} };

describe('AIControls', () => {
  it('is a group named “AI mode”', () => {
    render(<AIControls {...props} />);
    expect(screen.getByRole('group', { name: 'AI mode' })).toContainElement(screen.getByRole('switch', { name: 'AI' }));
  });

  it('off: only the switch; no speed group and no counter in the DOM', () => {
    render(<AIControls {...props} />);
    expect(screen.getByRole('switch', { name: 'AI' })).not.toBeChecked();
    expect(screen.queryByRole('group', { name: 'AI speed' })).toBeNull();
    expect(screen.queryByText(/^AI moves/)).toBeNull();
    expect(screen.queryByText('Thinking…')).toBeNull();
  });

  it('on: the speed group, counter and a hidden Thinking… appear', () => {
    render(<AIControls {...props} on />);
    expect(screen.getByRole('switch', { name: 'AI' })).toBeChecked();
    expect(screen.getByRole('group', { name: 'AI speed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Medium' })).toHaveAttribute('aria-pressed', 'true');
    for (const name of ['Slow', 'Fast']) expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('AI moves 1,234')).toBeInTheDocument();
    expect(screen.getByText('Thinking…')).toHaveAttribute('aria-hidden', 'true');
  });

  it('switching off removes the speed group and counter again', async () => {
    const { rerender } = render(<AIControls {...props} on />);
    rerender(<AIControls {...props} />);
    await waitFor(() => expect(screen.queryByRole('group', { name: 'AI speed' })).toBeNull());
    expect(screen.queryByText(/^AI moves/)).toBeNull();
  });

  it('switch and speed buttons call back; the pressed speed is kept', () => {
    const onToggle = vi.fn();
    const onSpeed = vi.fn();
    const { rerender } = render(<AIControls {...props} onToggle={onToggle} onSpeed={onSpeed} />);
    fireEvent.click(screen.getByRole('switch', { name: 'AI' }));
    expect(onToggle).toHaveBeenCalledWith(true);
    rerender(<AIControls {...props} on onToggle={onToggle} onSpeed={onSpeed} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fast' }));
    expect(onSpeed).toHaveBeenCalledWith('fast');
    fireEvent.click(screen.getByRole('button', { name: 'Medium' })); // already pressed: no deselect
    expect(onSpeed).toHaveBeenCalledTimes(1);
  });

  it('thinking indicator is exposed while ranking', () => {
    render(<AIControls {...props} on thinking />);
    expect(screen.getByText('Thinking…')).toHaveAttribute('aria-hidden', 'false');
  });

  it('the switch is disabled when disabled', () => {
    render(<AIControls {...props} disabled />);
    expect(screen.getByRole('switch', { name: 'AI' })).toBeDisabled();
  });
});
