#!/usr/bin/env node
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * `pnpm run release-notes [--version 0.53.0]`
 *
 * Print the CHANGELOG.md block for one version (default: the newest)
 * without its `##` heading: a starting point for the GitHub release notes.
 */

import fs from 'node:fs';
import path from 'node:path';

import {compareVersions, isVersion, parseChangelog} from './changelog.ts';
import {exitOnEpipe, parseStrict} from './cli.ts';
import {isMain, ROOT} from './repo.ts';

const USAGE =
  'usage: pnpm run release-notes [--version <version>] [--changelog <file>]';

/**
 * @param markdown CHANGELOG.md contents
 */
export function releaseNotes(markdown: string, version: string): string | null {
  const found = parseChangelog(markdown).find(
    v => compareVersions(v.version, version.replace(/^v/, '')) === 0,
  );
  return found ? found.body : null;
}
export function main(argv: string[]): number {
  const parsed = parseStrict(argv, {
    changelog: {type: 'string'},
    version: {type: 'string'},
  });
  if ('error' in parsed) {
    console.error(`${parsed.error}\n${USAGE}`);
    return 2;
  }
  const {values} = parsed;
  if (values.version !== undefined && !isVersion(values.version)) {
    console.error(
      `--version must be a version such as 0.53.0, got "${values.version}".\n${USAGE}`,
    );
    return 2;
  }
  const file = path.resolve(
    values.changelog || path.join(ROOT, 'CHANGELOG.md'),
  );
  if (!fs.existsSync(file)) {
    console.error(`${file} does not exist.\n${USAGE}`);
    return 2;
  }
  const markdown = fs.readFileSync(file, 'utf8');
  const version =
    values.version || (parseChangelog(markdown)[0] || {version: ''}).version;
  const notes = releaseNotes(markdown, version);
  if (notes === null) {
    console.error(
      `v${version.replace(/^v/, '')} is not in ${path.relative(process.cwd(), file)}.`,
    );
    return 1;
  }
  process.stdout.write(notes + '\n');
  return 0;
}

if (isMain(import.meta.url)) {
  exitOnEpipe();
  process.exitCode = main(process.argv.slice(2));
}
