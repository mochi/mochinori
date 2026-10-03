// @vitest-environment node

import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

import {
  generateEmojiData,
  OUTPUT_FILE,
} from '../../../scripts/generateEmojiData.mjs';
import {EMOJI_DATASOURCE_VERSION, unifiedIDFromText} from '../../index.ts';
import {supportedEmojis} from '../../supportedEmojis.ts';

const require = createRequire(import.meta.url);
const datasourceDir = path.dirname(
  require.resolve('emoji-datasource-facebook/package.json'),
);

describe('supportedEmojis', () => {
  it('is up to date with emoji-datasource-facebook (pnpm run generate)', async () => {
    expect(fs.readFileSync(OUTPUT_FILE, 'utf8')).toBe(
      await generateEmojiData(),
    );
  });

  it('comes from the emoji-datasource-facebook the default URL names', () => {
    const pkg = require('emoji-datasource-facebook/package.json') as {
      version: string;
    };
    expect(pkg.version).toBe(EMOJI_DATASOURCE_VERSION);
  });

  it('has an image for every emoji', () => {
    const missing = supportedEmojis
      .split('\n')
      .map(line => line.split('\t')[0])
      .filter(
        emoji =>
          !fs.existsSync(
            path.join(
              datasourceDir,
              'img/facebook/64',
              `${unifiedIDFromText(emoji)}.png`,
            ),
          ),
      );
    expect(missing).toEqual([]);
  });
});
