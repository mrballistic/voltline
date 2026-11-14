/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { isDesktopApp } from './platform';

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
});

describe('isDesktopApp', () => {
  it('is false in a browser', () => {
    expect(isDesktopApp()).toBe(false);
  });

  it('is true when Tauri has injected its internals', () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    expect(isDesktopApp()).toBe(true);
  });
});
