/**
 * True inside the Tauri desktop app, which injects `__TAURI_INTERNALS__` into every page it
 * loads. The one place the web build asks which shell it is in, so tests can stub it.
 */
export function isDesktopApp(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
