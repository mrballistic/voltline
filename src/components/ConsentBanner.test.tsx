/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CONSENT_KEY, openConsentSettings, readConsent, resetConsentState } from '../app/consent';
import { ThemeProvider } from '@mui/material/styles';
import { theme } from '../theme';
import ConsentBanner from './ConsentBanner';

const renderBanner = () => render(<ThemeProvider theme={theme}><ConsentBanner /></ThemeProvider>);

const gaScripts = () => document.head.querySelectorAll('script[src*="googletagmanager"]');

beforeEach(() => {
  localStorage.clear();
  resetConsentState();
  gaScripts().forEach((s) => s.remove());
  delete window.gtag;
  delete window.dataLayer;
});

afterEach(cleanup);

describe('ConsentBanner', () => {
  it('asks a first-time visitor in a labeled region with the copy and two equal choices', () => {
    renderBanner();
    const region = screen.getByRole('region', { name: 'Analytics cookies' });
    expect(region).toHaveTextContent('Voltline uses Google Analytics cookies to count visits. Nothing is sent unless you accept.');
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Decline', 'Accept']);
    // Equal weight: the same MUI variant and the same generated style class.
    expect(buttons[0].className).toBe(buttons[1].className);
    expect(getComputedStyle(buttons[0]).minHeight).toBe('44px');
  });

  it('is not a modal: nothing else is hidden from assistive tech', () => {
    renderBanner();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('Accept saves the choice, loads the tag and closes it', () => {
    renderBanner();
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(readConsent()).toBe('granted');
    expect(gaScripts()).toHaveLength(1);
    expect(screen.queryByRole('region', { name: 'Analytics cookies' })).toBeNull();
  });

  it('Decline saves the choice, loads nothing and closes it', () => {
    renderBanner();
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    expect(readConsent()).toBe('denied');
    expect(gaScripts()).toHaveLength(0);
    expect(screen.queryByRole('region', { name: 'Analytics cookies' })).toBeNull();
  });

  it('renders nothing for a returning visitor, until Cookie settings reopens it', () => {
    localStorage.setItem(CONSENT_KEY, 'denied');
    renderBanner();
    expect(screen.queryByRole('region', { name: 'Analytics cookies' })).toBeNull();
    act(() => openConsentSettings());
    expect(screen.getByRole('region', { name: 'Analytics cookies' })).toBeInTheDocument();
  });
});
