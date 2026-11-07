// @vitest-environment node

import fs from 'node:fs';
import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';

import {
  generateEmojiData,
  IMAGE_SETS,
  OUTPUT_FILE,
} from '../../../scripts/generateEmojiData.mjs';
import {getEmojiData} from '../../emojiData.ts';
import {
  EMOJI_DATASOURCE_VERSION,
  EMOJI_SETS,
  SKIN_TONES,
  unifiedIDFromText,
} from '../../index.ts';
import {applySkinTone} from '../../skinTone.ts';

const require = createRequire(import.meta.url);

interface DatasourceImages {
  unified: string;
  has_img_google?: boolean;
  has_img_twitter?: boolean;
}

// Each emoji and skin tone of emoji-datasource, by unified id
function getDatasourceImages(): Map<string, DatasourceImages> {
  const emojis = require('emoji-datasource/emoji.json') as (DatasourceImages & {
    skin_variations?: Record<string, DatasourceImages>;
  })[];
  return new Map(
    emojis.flatMap(emoji =>
      [emoji, ...Object.values(emoji.skin_variations ?? {})].map(
        image => [image.unified.toLowerCase(), image] as const,
      ),
    ),
  );
}

describe('supportedEmojis', () => {
  it('is up to date with emoji-datasource (pnpm run generate)', async () => {
    expect(fs.readFileSync(OUTPUT_FILE, 'utf8')).toBe(
      await generateEmojiData(),
    );
  });

  it('comes from the emoji-datasource the default URL names', () => {
    const pkg = require('emoji-datasource/package.json') as {
      version: string;
    };
    expect(pkg.version).toBe(EMOJI_DATASOURCE_VERSION);
  });

  it('keeps only emoji that every emoji set has images for', () => {
    expect(IMAGE_SETS).toEqual(EMOJI_SETS);
  });

  it('has an image in every set for every emoji, in each skin tone', () => {
    const images = getDatasourceImages();
    const emoji = getEmojiData().flatMap(data =>
      data.skinTones
        ? SKIN_TONES.map(tone => applySkinTone(data.emoji, tone))
        : [data.emoji],
    );
    expect(emoji.length).toBeGreaterThan(3000);
    const missing = emoji.filter(text => {
      const image = images.get(unifiedIDFromText(text));
      return !EMOJI_SETS.every(set => image?.[`has_img_${set}`]);
    });
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
