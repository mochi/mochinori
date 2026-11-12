#!/usr/bin/env node

/**
 * `pnpm run release:version --increment patch|minor [--dry-run]`
 *
 * Start a release: set the next version in the root package.json and in
 * every published package (they are all released together at one version),
 * then turn the pending changesets into that version's CHANGELOG.md section
 * and delete them. Commit the result as the release pull request; merging it
 * publishes (see .github/workflows/publish.yml).
 *
 * A pending [breaking] changeset refuses a patch release: while mochinori is
 * 0.x, breaking changes ship in a minor.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {exitOnEpipe, parseStrict} from '../changesets/cli.ts';
import {main as updateChangelog, patchGuard} from '../changesets/release.ts';
import {isMain, readPackages, readPending, ROOT} from '../changesets/repo.ts';

const USAGE =
  'usage: pnpm run release:version --increment patch|minor [--dry-run]';
export function bumpVersion(
  version: string,
  increment: 'patch' | 'minor',
): string {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) {
    throw new Error(`Cannot bump "${version}": expected a version like 0.1.0.`);
  }
  const [major, minor, patch] = m.slice(1).map(Number);
  if (version === '0.0.0') {
    // The first release is 0.1.0, whichever increment was asked for.
    return '0.1.0';
  }
  return increment === 'minor'
    ? `${major}.${minor + 1}.0`
    : `${major}.${minor}.${patch + 1}`;
}

/**
 * Replace the top-level "version" of a package.json without reformatting
 * the rest of the file.
 */
function writeVersion(file: string, version: string) {
  const text = fs.readFileSync(file, 'utf8');
  const re = /^(\s*"version":\s*)"[^"]*"/m;
  if (!re.test(text)) {
    throw new Error(`${file} has no "version" field.`);
  }
  fs.writeFileSync(
    file,
    text.replace(re, (_, prefix) => `${prefix}"${version}"`),
  );
}
export async function main(argv: string[]): Promise<number> {
  const parsed = parseStrict(argv, {
    'dry-run': {default: false, type: 'boolean'},
    increment: {type: 'string'},
    root: {default: ROOT, type: 'string'},
  });
  if ('error' in parsed) {
    console.error(`${parsed.error}\n${USAGE}`);
    return 2;
  }
  const {values} = parsed;
  const increment = values.increment || process.env.INCREMENT;
  if (increment !== 'patch' && increment !== 'minor') {
    console.error(`--increment must be patch or minor.\n${USAGE}`);
    return 2;
  }
  const root = path.resolve(values.root);
  const rootManifest = path.join(root, 'package.json');
  const current = JSON.parse(fs.readFileSync(rootManifest, 'utf8')).version;
  const version = bumpVersion(current, increment);
  const pending = readPending(path.join(root, '.changeset'), root);
  if (pending.length === 0) {
    console.error(
      'There are no pending changesets in .changeset/, so there is nothing to release.',
    );
    return 1;
  }
  const guard = patchGuard(version, pending);
  if (guard) {
    console.error(guard);
    return 1;
  }
  const published = readPackages(root).filter(p => !p.isPrivate);
  console.log(
    `Releasing v${version} (from v${current}) with ${pending.length} changeset(s):\n` +
      published.map(p => `  - ${p.name}`).join('\n'),
  );
  if (values['dry-run']) {
    return updateChangelog(['--preview', '--version', version, '--root', root]);
  }
  writeVersion(rootManifest, version);
  for (const pkg of published) {
    writeVersion(path.join(root, pkg.dir, 'package.json'), version);
  }
  const code = await updateChangelog(['--version', version, '--root', root]);
  if (code !== 0) {
    return code;
  }
  // Keep the lockfile's workspace versions in step.
  execFileSync('pnpm', ['install', '--lockfile-only'], {
    cwd: root,
    stdio: 'inherit',
  });
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
  }
  return 0;
}

if (isMain(import.meta.url)) {
  exitOnEpipe();
  main(process.argv.slice(2)).then(code => {
    process.exitCode = code;
  });
}
