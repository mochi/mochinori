// @vitest-environment node

import fs from 'node:fs';
import {describe, expect, it} from 'vitest';

import {
  generateEmojiData,
  OUTPUT_FILE,
} from '../../../scripts/generateEmojiData.mjs';
import {getEmojiData} from '../../emojiData.ts';
import {lookUpEmoji} from '../../findUnicodeEmoji.ts';
import {TWEMOJI_EMOJI_VERSION, twemojiID} from '../../index.ts';

describe('supportedEmojis', () => {
  it('is up to date with emojibase-data (pnpm run generate)', async () => {
    expect(fs.readFileSync(OUTPUT_FILE, 'utf8')).toBe(
      await generateEmojiData(),
    );
  });

  it('has the emoji of Emoji 18, with the version of the newer ones', () => {
    const versions = new Map(getEmojiData().map(e => [e.emoji, e.version]));
    expect(versions.get('\u{1F642}')).toBe(0);
    expect(versions.get('\u{1FAE9}')).toBe(16);
    expect(versions.get('\u{1FAEA}')).toBe(17);
    expect(versions.get('\u{1FAEB}')).toBe(18);
    expect(lookUpEmoji('\u{1FAF9}\u{1F3FD}')).toEqual({
      emoji: '\u{1FAF9}\u{1F3FD}',
      shortcode: ':leftwards_thumb::skin-tone-4:',
      version: 18,
    });
    expect(TWEMOJI_EMOJI_VERSION).toBe(17);
  });

  it("keeps Slack's names and texts", () => {
    const bySlackName = new Map(
      getEmojiData().map(e => [e.shortNames[0], e] as const),
    );
    expect(bySlackName.get('+1')?.shortNames).toEqual(['+1', 'thumbsup']);
    expect(bySlackName.get('slightly_smiling_face')?.texts).toEqual([
      ':)',
      '(:',
      ':-)',
    ]);
    expect(bySlackName.get('jp')?.emoji).toBe('\u{1F1EF}\u{1F1F5}');
    // Hair styles are components, not emoji of their own
    expect(bySlackName.has('red_hair')).toBe(false);
  });

  it('names the Twemoji images the way Twemoji does', () => {
    expect(twemojiID('\u{1F44D}\u{1F3FC}')).toBe('1f44d-1f3fc');
    expect(twemojiID('\u2764\uFE0F')).toBe('2764');
    expect(twemojiID('#\uFE0F\u20E3')).toBe('23-20e3');
    expect(twemojiID('\u00A9\uFE0F')).toBe('a9');
    expect(twemojiID('\u2764\uFE0F\u200D\u{1F525}')).toBe(
      '2764-fe0f-200d-1f525',
    );
    expect(twemojiID('\u{1F441}\uFE0F\u200D\u{1F5E8}\uFE0F')).toBe(
      '1f441-200d-1f5e8',
    );
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
