/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONSENT_KEY, GA_ID, choose, initConsent, isBannerOpen, openConsentSettings, readConsent, resetConsentState, subscribeBanner,
} from './consent';

const gaScripts = () => document.head.querySelectorAll('script[src*="googletagmanager"]');
const asDesktop = () => { (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {}; };

beforeEach(() => {
  localStorage.clear();
  resetConsentState();
  gaScripts().forEach((s) => s.remove());
  delete window.gtag;
  delete window.dataLayer;
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  vi.restoreAllMocks();
});

describe('initConsent', () => {
  it('shows the banner and loads nothing when the visitor has not answered', () => {
    initConsent();
    expect(isBannerOpen()).toBe(true);
    expect(gaScripts()).toHaveLength(0);
    expect(window.gtag).toBeUndefined();
  });

  it('loads analytics without a banner when consent was already granted', () => {
    localStorage.setItem(CONSENT_KEY, 'granted');
    initConsent();
    expect(isBannerOpen()).toBe(false);
    expect(gaScripts()).toHaveLength(1);
    expect((gaScripts()[0] as HTMLScriptElement).src).toBe(`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`);
    expect(typeof window.gtag).toBe('function');
  });

  it('stays silent when consent was already denied', () => {
    localStorage.setItem(CONSENT_KEY, 'denied');
    initConsent();
    expect(isBannerOpen()).toBe(false);
    expect(gaScripts()).toHaveLength(0);
  });

  it('shows the banner when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('private mode'); });
    initConsent();
    expect(isBannerOpen()).toBe(true);
  });
});

describe('choose', () => {
  it('accepting saves the choice, closes the banner and requests the tag once', () => {
    openConsentSettings();
    choose('granted');
    choose('granted');
    expect(readConsent()).toBe('granted');
    expect(isBannerOpen()).toBe(false);
    expect(gaScripts()).toHaveLength(1);
  });

  it('records page views only: js and config, as real Arguments objects', () => {
    choose('granted');
    const layer = window.dataLayer as IArguments[];
    expect(layer.map((a) => Object.prototype.toString.call(a))).toEqual(['[object Arguments]', '[object Arguments]']);
    expect(layer[0][0]).toBe('js');
    expect(Array.from(layer[1])).toEqual(['config', GA_ID]);
  });

  it('configures GA with gtag’s defaults, so cookie_domain stays auto (shared across *.mrballistic.com)', () => {
    choose('granted');
    const config = (window.dataLayer as IArguments[]).find((a) => a[0] === 'config')!;
    expect(config).toHaveLength(2);
    expect(config[2]).toBeUndefined();
  });

  it('declining saves the choice and loads nothing', () => {
    choose('denied');
    expect(readConsent()).toBe('denied');
    expect(gaScripts()).toHaveLength(0);
    expect(window.dataLayer).toBeUndefined();
  });

  it('withdrawing consent after the tag loaded reloads the page', () => {
    const reload = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ reload } as unknown as Location);
    choose('granted');
    choose('denied');
    expect(reload).toHaveBeenCalledOnce();
    expect(readConsent()).toBe('denied');
  });

  it('withdrawing reloads even when storage throws, so the tag is still removed', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const reload = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ reload } as unknown as Location);
    choose('granted');
    expect(gaScripts()).toHaveLength(1);
    choose('denied');
    expect(reload).toHaveBeenCalledOnce();
  });

  it('declining a second time does not reload', () => {
    const reload = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ reload } as unknown as Location);
    choose('denied');
    choose('denied');
    expect(reload).not.toHaveBeenCalled();
  });

  it('a choice that cannot be saved still closes the banner', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('private mode'); });
    openConsentSettings();
    expect(() => choose('denied')).not.toThrow();
    expect(isBannerOpen()).toBe(false);
  });
});

describe('banner state', () => {
  it('tells subscribers when the banner opens and closes, and stops after unsubscribing', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeBanner(listener);
    openConsentSettings();
    openConsentSettings();
    choose('denied');
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    openConsentSettings();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('focus', () => {
  it('a first-visit answer leaves focus alone; one after Cookie settings returns it there', () => {
    const opener = document.body.appendChild(document.createElement('button'));
    const other = document.body.appendChild(document.createElement('button'));
    initConsent();
    other.focus();
    choose('denied');
    expect(other).toHaveFocus();
    openConsentSettings(opener);
    other.focus();
    choose('denied');
    expect(opener).toHaveFocus();
    opener.remove();
    other.remove();
  });
});

describe('in the desktop app', () => {
  it('does nothing: no banner, no tag, nothing saved', () => {
    asDesktop();
    initConsent();
    expect(isBannerOpen()).toBe(false);
    openConsentSettings();
    expect(isBannerOpen()).toBe(false);
    choose('granted');
    expect(readConsent()).toBeNull();
    expect(gaScripts()).toHaveLength(0);
    expect(window.gtag).toBeUndefined();
  });

  it('ignores a grant saved by the web build', () => {
    localStorage.setItem(CONSENT_KEY, 'granted');
    asDesktop();
    initConsent();
    expect(gaScripts()).toHaveLength(0);
  });
});
