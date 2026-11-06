// @vitest-environment node

import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

import {
  generateEmojiData,
  OUTPUT_FILE,
} from '../../../scripts/generateEmojiData.mjs';
import {getEmojiData} from '../../emojiData.ts';
import {
  EMOJI_DATASOURCE_VERSION,
  SKIN_TONES,
  unifiedIDFromText,
} from '../../index.ts';
import {applySkinTone} from '../../skinTone.ts';

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

  it('has an image for every emoji, in each skin tone it takes', () => {
    const emoji = getEmojiData().flatMap(data =>
      data.skinTones
        ? SKIN_TONES.map(tone => applySkinTone(data.emoji, tone))
        : [data.emoji],
    );
    expect(emoji.length).toBeGreaterThan(3000);
    const missing = emoji.filter(
      text =>
        !fs.existsSync(
          path.join(
            datasourceDir,
            'img/facebook/64',
            `${unifiedIDFromText(text)}.png`,
          ),
        ),
    );
    expect(missing).toEqual([]);
  });

  it('has each emoji under one of the categories pickers show', () => {
    const categories = [...new Set(getEmojiData().map(e => e.category))];
    expect(categories).toEqual([
      'Smileys & Emotion',
      'People & Body',
      'Component',
      'Animals & Nature',
      'Food & Drink',
      'Travel & Places',
      'Activities',
      'Objects',
      'Symbols',
      'Flags',
    ]);
  });
});
