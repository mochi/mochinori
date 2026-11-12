/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Shared command-line helpers for the changeset scripts.
 */

import {parseArgs, type ParseArgsOptionsConfig} from 'node:util';

/**
 * Exit quietly when stdout is closed early (`... | head`).
 */
export function exitOnEpipe() {
  process.stdout.on('error', error => {
    if ((error as NodeJS.ErrnoException).code === 'EPIPE') {
      process.exit(0);
    }
    throw error;
  });
}

/**
 * Strict `parseArgs`: unknown options and positionals are errors. A bare
 * `--` (from `npm run x -- --flag`) is ignored.
 */
export function parseStrict<T extends ParseArgsOptionsConfig>(
  argv: string[],
  options: T,
):
  | {
      values: ReturnType<
        typeof parseArgs<{
          allowPositionals: false;
          args: string[];
          options: T;
          strict: true;
        }>
      >['values'];
    }
  | {error: string} {
  try {
    const {values} = parseArgs({
      allowPositionals: false,
      args: argv.filter(arg => arg !== '--'),
      options,
      strict: true,
    });
    return {values};
  } catch (error) {
    return {error: (error as Error).message};
  }
}
