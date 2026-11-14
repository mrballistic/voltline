// The dev checks and screenshot scripts answer the cookie banner before the page loads, so they
// never see it (a script that captures the banner on purpose just leaves this out).
import { CONSENT_KEY } from '../src/app/consent';

/** An init script (`page.addInitScript` / `context.addInitScript`) that saves a declined answer. */
export const DECLINED_CONSENT = `try { localStorage.setItem(${JSON.stringify(CONSENT_KEY)}, 'denied'); } catch {}`;
