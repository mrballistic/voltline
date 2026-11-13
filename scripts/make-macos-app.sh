#!/usr/bin/env bash
# Builds the Voltline desktop app (Tauri 2) into dist-desktop/, then signs and packages it.
#
#   scripts/make-macos-app.sh                       build for this Mac's architecture, sign, package
#   scripts/make-macos-app.sh --universal           build one app for Apple Silicon and Intel, sign, package
#   scripts/make-macos-app.sh --universal --no-sign build and assemble only (what CI runs)
#   scripts/make-macos-app.sh --app PATH            sign and package an existing app, e.g. the
#                                                   universal build from CI (see BUILDING.md)
#
# Environment:
#   SIGN_IDENTITY   codesign identity (default: first "Developer ID Application" in the keychain)
#   NOTARY_PROFILE  notarytool keychain profile; if set, the app and disk image are notarized
#                   and stapled. Create one with:
#                     xcrun notarytool store-credentials <name> --apple-id <id> --team-id <team>
#
# Also writes a drag-to-Applications disk image if create-dmg is installed
# (brew install create-dmg).
#
# --universal needs both Apple targets: rustup target add aarch64-apple-darwin x86_64-apple-darwin
# The app version is package.json's "version" (via src-tauri/tauri.conf.json).
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT=$PWD
DIST=$ROOT/dist-desktop
APP=$DIST/Voltline.app
EXE=Contents/MacOS/voltline

SIGN=1
UNIVERSAL=0
SOURCE_APP=
while [[ $# -gt 0 ]]; do
	case "$1" in
		--no-sign) SIGN=0 ;;
		--universal) UNIVERSAL=1 ;;
		--app) SOURCE_APP=${2:?--app needs a path}; shift ;;
		*) echo "usage: $0 [--universal] [--no-sign] | --app PATH" >&2; exit 2 ;;
	esac
	shift
done

if [[ $SIGN == 1 && -z "${SIGN_IDENTITY:-}" ]]; then
	SIGN_IDENTITY=$(security find-identity -v -p codesigning | sed -n 's/.*"\(Developer ID Application:[^"]*\)".*/\1/p' | head -1)
	[[ -n "$SIGN_IDENTITY" ]] || { echo "No Developer ID Application identity found; set SIGN_IDENTITY" >&2; exit 1; }
fi

if [[ -n "$SOURCE_APP" ]]; then
	echo "==> Using $SOURCE_APP"
	[[ -d "$SOURCE_APP" ]] || { echo "error: $SOURCE_APP not found" >&2; exit 1; }
	# Resolve before deleting $APP, in case PATH is $APP itself
	SOURCE_APP=$(cd "$SOURCE_APP" && pwd)
	if [[ "$SOURCE_APP" != "$APP" ]]; then
		rm -rf "$APP"
		mkdir -p "$DIST"
		ditto "$SOURCE_APP" "$APP"
	fi
else
	# Homebrew's Rust only ships the host's standard library, so a cross build
	# needs rustup's toolchain (the one `rustup target add` installs into) first on PATH.
	if command -v rustup >/dev/null; then
		PATH="$(dirname "$(rustup which cargo)"):$PATH"
		export PATH
	fi

	if [[ $UNIVERSAL == 1 ]]; then
		TARGET_ARGS=(--target universal-apple-darwin)
		BUNDLE=src-tauri/target/universal-apple-darwin/release/bundle/macos/Voltline.app
	else
		TARGET_ARGS=()
		BUNDLE=src-tauri/target/release/bundle/macos/Voltline.app
	fi

	echo "==> Building (tauri build ${TARGET_ARGS[*]:-})"
	# Only the .app: the disk image is made below, after signing, so it holds the signed app.
	# Keep Tauri from signing on its own; this script signs (or deliberately doesn't).
	env -u APPLE_SIGNING_IDENTITY -u APPLE_CERTIFICATE npx tauri build --bundles app ${TARGET_ARGS[@]+"${TARGET_ARGS[@]}"}

	echo "==> Assembling $APP"
	rm -rf "$APP"
	mkdir -p "$DIST"
	ditto "$BUNDLE" "$APP"
fi

VERSION=$(plutil -extract CFBundleShortVersionString raw "$APP/Contents/Info.plist")

# "arm64", "x86_64", or "universal" for both
ARCHS=$(lipo -archs "$APP/$EXE")
[[ "$ARCHS" == *" "* ]] && ARCH_LABEL=universal || ARCH_LABEL=$ARCHS
if [[ $UNIVERSAL == 1 && "$ARCH_LABEL" != universal ]]; then
	echo "error: expected a universal binary, got $ARCHS" >&2
	exit 1
fi

if [[ $SIGN == 0 ]]; then
	echo "==> Done (unsigned, $ARCHS, version $VERSION): $APP"
	exit 0
fi

# The bundle is one executable plus resources (the web build is embedded in
# the binary), so signing the app signs everything in it.
echo "==> Signing with: $SIGN_IDENTITY"
codesign --force --options runtime --timestamp --sign "$SIGN_IDENTITY" "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"

ZIP=$DIST/Voltline-$VERSION-macos-$ARCH_LABEL.zip
rm -f "$ZIP"
ditto -c -k --keepParent "$APP" "$ZIP"

if [[ -n "${NOTARY_PROFILE:-}" ]]; then
	echo "==> Notarizing"
	xcrun notarytool submit "$ZIP" --keychain-profile "$NOTARY_PROFILE" --wait
	xcrun stapler staple "$APP"
	rm -f "$ZIP"
	ditto -c -k --keepParent "$APP" "$ZIP"
	spctl -a -vvv -t exec "$APP"
else
	echo "note: NOTARY_PROFILE not set; skipping notarization (Gatekeeper will warn on other Macs)"
	# Expected to say "rejected (Unnotarized Developer ID)" until the app is notarized
	spctl -a -vvv -t exec "$APP" || true
fi

# Disk image: the app on the left, an Applications shortcut on the right, and a
# background with an arrow between them (scripts/dmg-background.swift).
DMG=$DIST/Voltline-$VERSION-macos-$ARCH_LABEL.dmg
if command -v create-dmg >/dev/null; then
	echo "==> Building disk image"
	STAGE=$DIST/dmg-staging
	rm -rf "$STAGE" "$DMG"
	mkdir -p "$STAGE"
	ditto "$APP" "$STAGE/Voltline.app"
	swift scripts/dmg-background.swift "$DIST/dmg-background.png" 1
	swift scripts/dmg-background.swift "$DIST/dmg-background@2x.png" 2
	tiffutil -cathidpicheck "$DIST/dmg-background.png" "$DIST/dmg-background@2x.png" -out "$DIST/dmg-background.tiff" >/dev/null
	# Icon positions must match those drawn in scripts/dmg-background.swift
	create-dmg \
		--volname "Voltline" \
		--volicon "$APP/Contents/Resources/icon.icns" \
		--background "$DIST/dmg-background.tiff" \
		--window-pos 200 120 \
		--window-size 640 400 \
		--icon-size 112 \
		--text-size 13 \
		--icon "Voltline.app" 170 185 \
		--hide-extension "Voltline.app" \
		--app-drop-link 470 185 \
		"$DMG" "$STAGE" >/dev/null
	rm -rf "$STAGE" "$DIST"/dmg-background*
	codesign --force --timestamp --sign "$SIGN_IDENTITY" "$DMG"
	if [[ -n "${NOTARY_PROFILE:-}" ]]; then
		echo "==> Notarizing disk image"
		xcrun notarytool submit "$DMG" --keychain-profile "$NOTARY_PROFILE" --wait
		xcrun stapler staple "$DMG"
		spctl --assess --type open --context context:primary-signature --verbose "$DMG"
	fi
else
	echo "note: create-dmg not installed (brew install create-dmg); skipping the disk image"
	DMG=
fi

echo "==> Done: $APP"
echo "         $ZIP"
[[ -n "$DMG" ]] && echo "         $DMG"
true
