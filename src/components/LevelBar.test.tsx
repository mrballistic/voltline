/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import LevelBar from './LevelBar';

afterEach(cleanup);

describe('LevelBar', () => {
  it('puts the level label and its named progress bar in one row', () => {
    render(<LevelBar level={3} progress={0.58} />);
    const bar = screen.getByRole('progressbar', { name: 'Level 3 progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '58');
    const label = screen.getByText('Level 3');
    const row = bar.parentElement!;
    expect(label.parentElement).toBe(row);
    expect(getComputedStyle(row).display).toBe('flex');
    expect(getComputedStyle(row).flexDirection).toBe('row');
  });
});
