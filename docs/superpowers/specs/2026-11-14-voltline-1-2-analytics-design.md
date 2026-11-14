# Voltline 1.2: analytics with consent, and a Mac app link

Date: 2026-11-14 · Status: approved by Todd in conversation · Builds on 1.1.0 (live)

## Intent
Todd: “let’s add the same google tracking we use on mrballistic to voltline, and add in the cookie popup as well. and let’s add a link for the mac desktop version in the footer as well.” Then: “you don’t need to update the mac app.”

## Changes

### 1. Google Analytics, only after consent (web only)
- Same property as mrballistic.com: `G-CWEHQPGMV8`. Port mrballistic.com's `src/composables/useConsent.ts` (in `~/current_work/mrballistic/new-site`) to a small non-React module plus a React banner. Behavior is identical: nothing is requested from Google until the visitor accepts; declining, or never answering, means no Google request and no cookies; withdrawing after accepting reloads the page so the tag is gone.
- Same localStorage key, `rc-analytics-consent`, values `granted` / `denied`. *(My call: it's a different origin from mrballistic.com, so the answer is separate per site; sharing it would need a cookie on `.mrballistic.com` and a change to that site.)*
- Page views only (`gtag('config', GA_ID)`), no custom events *(my call)*.
- **Never in the desktop app.** When running inside Tauri, the consent module does nothing, the banner never shows, and the footer hides “Cookie settings” and “Mac app” *(my call: the Mac app stays offline; it isn't being rebuilt now, but the next build must not pick this up)*.

### 2. The cookie banner
- Copy (curly punctuation): label “Analytics cookies”; body “Voltline uses Google Analytics cookies to count visits. Nothing is sent unless you accept.”; buttons “Decline” and “Accept” with equal weight (same size and style).
- A small card fixed bottom-left on wide screens, full width at the bottom on phones, in the chrome's dialog surface style (`#1a1a34`), 44 px buttons, the yellow focus ring. It is a labeled region (`role="region"`, `aria-label` “Analytics cookies”), not a modal: the game stays playable behind it. It shows after mount only when there's no saved answer, so returning visitors never see it flash.

### 3. Footer
`Credits · MIT License · Mac app · Cookie settings`. “Mac app” links to `https://github.com/mrballistic/voltline/releases/latest` (new tab). “Cookie settings” is a button styled as a link that reopens the banner. Both are hidden in the desktop app.

### 4. CSP and the rule it changes
- CSP gains Google's tag and collection endpoints: `script-src 'self' https://www.googletagmanager.com`; `connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com`; `img-src` adds `https://*.google-analytics.com https://*.googletagmanager.com`. Still no `unsafe-eval` and no inline script. Change it in `vite.config.ts` (`preview.headers`) and `deploy/apache-voltline-le-ssl.conf`; the controller installs the vhost on the server. `src-tauri/tauri.conf.json` keeps its offline CSP.
- CLAUDE.md invariant 8 becomes: no LLM code, no API keys; the only runtime network call is Google Analytics, loaded only after the visitor accepts the cookie banner, web build only, never in the desktop app. The CI bundle-hygiene check stays as is.

### 5. Tests
- Unit: consent module (no answer → banner; granted → tag requested once; denied → nothing; withdraw after grant → reload; Tauri → no-op), banner (equal buttons, both choices persist and close it, Cookie settings reopens it), footer (links, hidden in Tauri).
- Smoke (`scripts/smoke.spec.ts`): the banner appears on first visit, Decline closes it and no request goes to any Google host; a second run that Accepts (with Google's script routed to an empty 200 so CI makes no real external call) loads the tag with no CSP violation. The existing play/hint/AI checks run with the banner answered.

## Release
Ships as 1.2.0 to the web (PR, green CI, merge, tag). The Mac app is not rebuilt.

## Non-goals
Custom GA events; sharing consent with mrballistic.com; any desktop-app change.
