// Analytics consent, ported from mrballistic.com's src/composables/useConsent.ts
// (docs/superpowers/specs/2026-11-14-voltline-1-2-analytics-design.md). Google's tag is not
// requested at all until the visitor accepts; declining, or never answering, means no Google
// request and no cookies. In the desktop app every entry point is a no-op.
//
// Same key and GA property as mrballistic.com. Voltline is a different origin, so its answer
// is kept separately.
import { isDesktopApp } from './platform';

export const CONSENT_KEY = 'rc-analytics-consent';
export const GA_ID = 'G-CWEHQPGMV8';

export type ConsentChoice = 'granted' | 'denied';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

// Module scope so the footer's "Cookie settings" button and the banner share one state. React
// reads it through subscribeBanner / isBannerOpen (useSyncExternalStore).
let bannerOpen = false;
let loaded = false;
const listeners = new Set<() => void>();

function setBannerOpen(open: boolean): void {
  if (bannerOpen === open) return;
  bannerOpen = open;
  for (const listener of listeners) listener();
}

export function isBannerOpen(): boolean {
  return bannerOpen;
}

export function subscribeBanner(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readConsent(): string | null {
  try {
    return window.localStorage.getItem(CONSENT_KEY);
  } catch {
    return null;
  }
}

function saveConsent(choice: ConsentChoice): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, choice);
  } catch {
    // Private mode: ask again next visit.
  }
}

export function loadAnalytics(): void {
  if (loaded || isDesktopApp()) return;
  loaded = true;
  const tag = document.createElement('script');
  tag.async = true;
  tag.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(tag);
  window.dataLayer = window.dataLayer || [];
  // gtag.js only recognises real Arguments objects on the dataLayer, not arrays, so this has
  // to be a classic function using `arguments`.
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', GA_ID);
}

// Runs once on mount, so returning visitors who already answered never see the banner flash.
export function initConsent(): void {
  if (isDesktopApp()) return;
  const choice = readConsent();
  if (choice === 'granted') loadAnalytics();
  else if (choice !== 'denied') setBannerOpen(true);
}

export function choose(choice: ConsentChoice): void {
  if (isDesktopApp()) return;
  const previous = readConsent();
  saveConsent(choice);
  setBannerOpen(false);
  if (choice === 'granted') loadAnalytics();
  // Withdrawing consent after the tag has loaded: reload so it's gone.
  else if (previous === 'granted' && loaded) window.location.reload();
}

export function openConsentSettings(): void {
  if (isDesktopApp()) return;
  setBannerOpen(true);
}

// Test-only: module state otherwise persists between tests.
export function resetConsentState(): void {
  loaded = false;
  setBannerOpen(false);
}
