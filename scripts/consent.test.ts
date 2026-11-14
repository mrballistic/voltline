/** @vitest-environment jsdom */
import { afterEach, expect, it } from 'vitest';
import { CONSENT_KEY, initConsent, isBannerOpen, readConsent, resetConsentState } from '../src/app/consent';
import { DECLINED_CONSENT } from './consent';

afterEach(() => { localStorage.clear(); resetConsentState(); });

it('the init script saves a declined answer, so the banner never opens and nothing loads', () => {
  new Function(DECLINED_CONSENT)();
  expect(localStorage.getItem(CONSENT_KEY)).toBe('denied');
  expect(readConsent()).toBe('denied');
  initConsent();
  expect(isBannerOpen()).toBe(false);
  expect(document.head.querySelector('script[src*="googletagmanager"]')).toBeNull();
});
