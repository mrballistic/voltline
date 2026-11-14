import { describe, expect, it } from 'vitest';
import { CHROME, theme } from './theme';

type Styles = Record<string, unknown>;
const root = (name: 'MuiButtonBase' | 'MuiButton' | 'MuiIconButton' | 'MuiToggleButton') =>
  (theme.components?.[name]?.styleOverrides as { root?: Styles } | undefined)?.root ?? {};

describe('theme', () => {
  it('gives every focusable control the same yellow focus ring and no ripple', () => {
    expect(theme.components?.MuiButtonBase?.defaultProps?.disableRipple).toBe(true);
    expect(root('MuiButtonBase')['&.Mui-focusVisible']).toEqual({ outline: '2px solid #ffe14d', outlineOffset: 3 });
    expect(CHROME.focus).toBe('#ffe14d');
  });

  it('uses a readable disabled color with a dashed border as the non-color cue', () => {
    expect(theme.palette.action.disabled).toBe('#7d86b8');
    expect(CHROME.textDisabled).toBe('#7d86b8');
    expect(root('MuiButton')['&.Mui-disabled']).toMatchObject({
      color: '#7d86b8', border: '1px dashed rgba(154,163,214,0.45)', background: 'transparent', boxShadow: 'none',
    });
  });

  it('sizes controls to 44 px targets', () => {
    expect(root('MuiButton')).toMatchObject({ minHeight: 44, minWidth: 110 });
    expect(root('MuiIconButton')).toMatchObject({ width: 44, height: 44, borderRadius: 10 });
    expect(root('MuiToggleButton')).toMatchObject({ minHeight: 44, minWidth: 52, fontSize: 14, borderRadius: 8 });
  });

  it('presses buttons down 1 px, never scales them, and drops the movement with reduced motion', () => {
    const b = root('MuiButton');
    expect(b['&:active']).toEqual({ transform: 'translateY(1px)' });
    expect(JSON.stringify(b)).not.toContain('scale');
    const reduced = b['@media (prefers-reduced-motion: reduce)'] as Styles;
    expect(reduced['&:active']).toEqual({ transform: 'none' });
    expect(String(reduced.transition)).toMatch(/^color /);
    expect(String(reduced.transition)).not.toContain('transform');
  });

  it('draws dialogs on a flat surface where magenta stays readable', () => {
    const paper = (theme.components?.MuiDialog?.styleOverrides as { paper?: Styles }).paper;
    expect(paper).toEqual({ backgroundColor: '#1a1a34', backgroundImage: 'none', border: '1px solid #4dd8ff55', margin: 16 });
    expect(CHROME.dialog).toBe('#1a1a34');
  });

  it('marks the selected speed in magenta', () => {
    expect(root('MuiToggleButton')['&.Mui-selected, &.Mui-selected:hover']).toMatchObject({
      color: '#ff4fd8', background: 'rgba(255,79,216,0.16)', boxShadow: 'inset 0 0 0 1px #ff4fd8',
    });
  });

  it('draws the AI switch’s focus ring on the switch root, which its overflow:hidden can’t clip', () => {
    const sw = theme.components?.MuiSwitch?.styleOverrides as { root?: Styles; switchBase?: Styles } | undefined;
    // MUI's .MuiSwitch-root clips its children, so a ring on the inner switchBase shows as a sliver.
    expect(sw?.switchBase?.['&.Mui-focusVisible']).toEqual({ outline: 'none' });
    expect(sw?.root?.['&:has(.Mui-focusVisible)']).toEqual({ outline: '2px solid #ffe14d', outlineOffset: 3, borderRadius: 12 });
  });
});
