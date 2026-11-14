/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import LogoMark from './LogoMark';

afterEach(cleanup);

describe('LogoMark', () => {
  it('gives each instance its own gradient id, so two marks never share one', () => {
    const { container } = render(<><LogoMark /><LogoMark /></>);
    const ids = [...container.querySelectorAll('linearGradient')].map((g) => g.id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
    const strokes = [...container.querySelectorAll('path')].map((p) => p.getAttribute('stroke'));
    expect(strokes).toEqual(ids.map((id) => `url(#${id})`));
  });

  it('is decorative and drawn at 26 px by default', () => {
    const { container } = render(<LogoMark />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('width', '26');
    expect(svg).toHaveAttribute('viewBox', '0 0 100 100');
  });
});
