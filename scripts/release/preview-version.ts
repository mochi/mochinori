#!/usr/bin/env node

/**
 * `node scripts/release/preview-version.ts --sha <commit> [--pr <number>]`
 *
 * Stamp every published package with a unique preview version before a
 * pkg.pr.new continuous release (.github/workflows/pkg-pr-new.yml). From a
 * monorepo at 0.1.0:
 *
 *   main (pkg.pr.new)   0.1.1-main.g4282a68
 *   PR (pkg.pr.new)     0.1.1-pr.21.g4282a68
 *
 * so every preview is newer than the latest release and older than the next
 * one, and two commits never share a version. The commit hash carries git
 * describe's `g` prefix because a bare abbreviated hash can be all digits
 * with a leading zero, which is not a valid semver identifier.
 *
 * Only the working tree changes: nothing is committed, tagged or pushed.
 */

import fs from 'node:fs';
import path from 'node:path';

import {parseStrict} from '../changesets/cli.ts';
import {isMain, readPackages, ROOT} from '../changesets/repo.ts';
import {writeVersion} from './version.ts';

const USAGE =
  'usage: node scripts/release/preview-version.ts --sha <commit> [--pr <number>]';

export function previewVersion(
  version: string,
  {pr, sha}: {pr?: string; sha: string},
): string {
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) {
    throw new Error(`Expected --sha to be a commit hash, got: ${sha}`);
  }
  if (pr && !/^[1-9][0-9]*$/.test(pr)) {
    throw new Error(`Expected --pr to be a pull request number, got: ${pr}`);
  }
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) {
    throw new Error(`Cannot derive a preview version from ${version}`);
  }
  const channel = pr ? `pr.${pr}` : 'main';
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}-${channel}.g${sha
    .slice(0, 7)
    .toLowerCase()}`;
}

export function main(argv: string[]): number {
  const parsed = parseStrict(argv, {
    pr: {type: 'string'},
    sha: {type: 'string'},
  });
  if ('error' in parsed) {
    console.error(`${parsed.error}\n${USAGE}`);
    return 2;
  }
  const rootManifest = path.join(ROOT, 'package.json');
  const current = JSON.parse(fs.readFileSync(rootManifest, 'utf8')).version;
  let version;
  try {
    version = previewVersion(current, {
      pr: parsed.values.pr || undefined,
      sha: parsed.values.sha || '',
    });
  } catch (error) {
    console.error(`${(error as Error).message}\n${USAGE}`);
    return 2;
  }
  console.log(`Preview version: ${current} -> ${version}`);
  writeVersion(rootManifest, version);
  for (const pkg of readPackages(ROOT).filter(p => !p.isPrivate)) {
    writeVersion(path.join(ROOT, pkg.dir, 'package.json'), version);
  }
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
  }
  return 0;
}

if (isMain(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
