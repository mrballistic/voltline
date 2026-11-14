/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import TrayNotice from './TrayNotice';

afterEach(cleanup);

describe('TrayNotice', () => {
  it('TrayNotice renders the full message only when trayFull', () => {
    const { rerender } = render(<TrayNotice trayFull={false} />);
    expect(screen.queryByText('Tray full—spend one to free a slot.')).toBeNull();
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    rerender(<TrayNotice trayFull />);
    expect(screen.getByText('Tray full—spend one to free a slot.')).toBeInTheDocument();
  });
});
