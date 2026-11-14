# Building Voltline

This covers building the web game and the macOS desktop app, and signing and notarizing the app for release. What Voltline is and how to play it are in the [README](README.md); how the code fits together, including the desktop shell, is in [ARCHITECTURE.md](ARCHITECTURE.md); deploying the website is in [DEPLOY.md](DEPLOY.md).

## The web build

Use Node 26 (`nvm use` reads `.nvmrc`).

```
npm ci
npm run build      # tsc --noEmit + vite build -> dist/
npm run preview    # serve dist/ locally
```

`dist/` is a static site with relative paths (`base: './'`). It is what the server hosts, and what the desktop app embeds.

## The desktop app

The desktop app is a [Tauri 2](https://tauri.app) shell around that same web build, in `src-tauri/`. It has no plugins and no IPC commands: the game runs exactly as it does in a browser, under the same Content Security Policy as the server.

### Prerequisites

- Xcode’s command line tools (`xcode-select --install`).
- Rust stable via [rustup](https://rustup.rs), with both Apple targets for universal builds:

  ```
  rustup target add aarch64-apple-darwin x86_64-apple-darwin
  ```

  If Homebrew’s `rust` is also installed it usually comes first on `PATH`, and it only has the standard library for your own Mac’s architecture, so cross builds fail with “can’t find crate for `std`”. `scripts/make-macos-app.sh` puts rustup’s toolchain first for you; for `npm run desktop:*` by hand, run `export PATH="$(dirname "$(rustup which cargo)"):$PATH"` first.

- Optional, for the disk image: `brew install create-dmg`.

The Tauri CLI comes with `npm ci` (`@tauri-apps/cli`).

### Run it in a window

```
npm run desktop:dev
```

That starts the Vite dev server on port 5173 and opens the game in a native window with live reload. Right-click › Inspect Element opens Web Inspector. The dev server is started with `--strictPort` so the window can never load some other project’s server: if port 5173 is taken, it stops with an error. To use another port for one run:

```
npx tauri dev --config '{"build":{"devUrl":"http://localhost:5199","beforeDevCommand":"npm run dev -- --port 5199 --strictPort"}}'
```

The CSP only applies to bundled builds; in dev the window loads the Vite server directly.

### Build the app

```
scripts/make-macos-app.sh --universal --no-sign
```

builds a universal (Apple Silicon and Intel) `dist-desktop/Voltline.app`, unsigned. Check it with `lipo -archs dist-desktop/Voltline.app/Contents/MacOS/voltline` (expect `x86_64 arm64`). Without `--universal` it builds for your Mac’s architecture only. Without `--no-sign` it goes on to sign and package (below).

`npm run desktop:build` is the plain `tauri build`: an app and a basic disk image for your own architecture under `src-tauri/target/release/bundle/`, unsigned. Use the script for anything you share.

The app needs macOS 13 or later (`bundle.macOS.minimumSystemVersion`). Its version is `package.json`’s `version`.

## Releasing the macOS app

GitHub builds the unsigned universal app; you sign, notarize and package it on your Mac with your Developer ID.

### 1. Build on GitHub

Every push to `main` (except docs-only changes) runs the **macOS universal build** workflow (`.github/workflows/macos-universal.yml`); you can also start it by hand from the Actions tab. It builds the web app, runs `scripts/make-macos-app.sh --universal --no-sign` on a macOS runner, checks that both architectures are in the binary, and uploads a `Voltline-universal-unsigned` artifact (kept 30 days).

### 2. Sign, notarize and package locally

You need a “Developer ID Application” certificate in your keychain (`security find-identity -v -p codesigning` lists it) and notarization credentials stored once as a keychain profile:

```
xcrun notarytool store-credentials <profile> --apple-id <apple-id> --team-id <team-id>
```

Then download the latest artifact and package it:

```
rm -rf dist-desktop/ci && gh run download --repo mrballistic/voltline --name Voltline-universal-unsigned --dir dist-desktop/ci
ditto -x -k dist-desktop/ci/Voltline-universal-unsigned.zip dist-desktop/ci
NOTARY_PROFILE=<profile> scripts/make-macos-app.sh --app dist-desktop/ci/Voltline.app
```

That copies the app to `dist-desktop/Voltline.app`, signs it with your first Developer ID Application identity (hardened runtime, secure timestamp), verifies it with `codesign --verify --deep --strict`, notarizes and staples it, checks it with `spctl`, and writes `dist-desktop/Voltline-<version>-macos-universal.zip`. With `create-dmg` installed it also writes a matching `.dmg`: the app on the left, an Applications shortcut on the right, and a background with an arrow between them, drawn by `scripts/dmg-background.swift`. The disk image is signed and notarized too.

Notarization uploads the app to Apple, so run it only for a build you mean to ship. Leave `NOTARY_PROFILE` unset to sign without notarizing: the zip and disk image are still written, and `spctl` reports `rejected (Unnotarized Developer ID)`, which is expected until the app is notarized. After notarizing, `spctl -a -vvv -t exec dist-desktop/Voltline.app` should report `source=Notarized Developer ID`.

`SIGN_IDENTITY` picks a different identity. The script header lists every option.

### Building and signing on your own Mac

`scripts/make-macos-app.sh --universal` builds, signs and packages in one go, without GitHub; drop `--universal` for your own architecture only. Add `NOTARY_PROFILE=<profile>` to notarize.

## The app icon

The icon is the Voltline V mark. Its design master is `docs/design/voltline-chrome/logo-app-icon.svg`, and `src-tauri/icons/source.svg` is a copy of it with an explicit 1024 px size. Edit the master, copy it over `source.svg` (keeping `width="1024" height="1024"`), then run

```
npx tsx scripts/render-icon.ts
```

which renders it at 1024 px with Chromium (via Playwright, so `npx playwright install chromium` once) and regenerates every size in `src-tauri/icons/` with `npx tauri icon`. The script stops if `source.svg` has drifted from the master. Commit the regenerated files.

## Troubleshooting

- **`warning: stripping debug info with rust-objcopy failed … Library not loaded: @rpath/libLLVM.dylib`.** Some rustup toolchains ship a `rust-objcopy` that can’t find its LLVM library. The build still succeeds, but the binary keeps its symbols (about 10 MB universal instead of about 7). Reinstalling the toolchain (`rustup toolchain install stable --force`) may fix it.
- **`error: target not found` or “can’t find crate for `std`”** on a universal build: add both targets with rustup (above), and make sure rustup’s `cargo` is the one on `PATH`.
- **`Port 5173 is in use`** from `npm run desktop:dev`: another dev server has the port. Stop it or use the port override above.
