#!/usr/bin/env node
// Release notes: prints the GitHub Release body for a version, taken from that
// version's CHANGELOG.md section. Fails if the CHANGELOG has no section for the
// version, or an empty one, so the deploy workflow can check it before shipping.
//
//   node scripts/release-notes.mjs 1.0.0 > notes.md
//   CHANGELOG_PATH=other.md node scripts/release-notes.mjs 1.0.0   (for tests)
//
// Plain Node with no dependencies, so the release job needs no npm ci.

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const version = process.argv[2];
// X.Y.Z with an optional prerelease suffix (1.0.0-rc.1); the deploy workflow
// treats a version containing "-" as a prerelease.
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version ?? '')) {
  console.error(`release-notes: “${version ?? ''}” isn’t a version (X.Y.Z or X.Y.Z-suffix).`);
  process.exit(1);
}

// A section runs from its `## <version>` (or `## <version> (<date>)`) heading
// to the next `## `. Compared as text, so the version needs no escaping.
const file = process.env.CHANGELOG_PATH ?? join(ROOT, 'CHANGELOG.md');
const lines = readFileSync(file, 'utf8').split('\n');
const heading = `## ${version}`;
const start = lines.findIndex((line) => line === heading || line.startsWith(`${heading} `));
if (start === -1) {
  console.error(`release-notes: CHANGELOG.md has no “## ${version}” section.`);
  process.exit(1);
}
const rest = lines.slice(start + 1);
const end = rest.findIndex((line) => line.startsWith('## '));
const body = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
if (body === '') {
  console.error(`release-notes: the “## ${version}” section of CHANGELOG.md is empty.`);
  process.exit(1);
}

process.stdout.write(`${body}\n`);
