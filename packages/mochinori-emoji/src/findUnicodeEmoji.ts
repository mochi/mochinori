import {getEmojiData} from './emojiData.ts';
import {applySkinTone, getSkinTone, takesSkinTone} from './skinTone.ts';
import {SKIN_TONES, skinToneShortcode} from './skinToneNames.ts';

const VARIATION_SELECTOR = '️';
const SKIN_TONE_MODIFIERS = /[\u{1F3FB}-\u{1F3FF}]/gu;

let byKey:
  Map<string, {emoji: string; name: string; version: number}> | undefined;

/** An emoji with no variation selector or skin tone, to look it up by */
function keyOf(emoji: string): string {
  return emoji
    .replaceAll(VARIATION_SELECTOR, '')
    .replace(SKIN_TONE_MODIFIERS, '');
}

/** An emoji of the database, as {@link lookUpEmoji} finds it */
export interface FoundEmoji {
  /** As the database spells it, with the skin tone it was looked up with */
  emoji: string;
  /** Such as `:+1:` or `:+1::skin-tone-3:` */
  shortcode: string;
  /** The Emoji version that added it when 16 or later, otherwise 0 */
  version: number;
}

/** The emoji of the database that a grapheme is */
export function lookUpEmoji(grapheme: string): FoundEmoji | null {
  if (!byKey) {
    byKey = new Map();
    for (const {emoji, shortNames, version} of getEmojiData()) {
      if (shortNames[0]) {
        byKey.set(keyOf(emoji), {emoji, name: shortNames[0], version});
      }
    }
  }
  const found = byKey.get(keyOf(grapheme));
  if (!found) {
    return null;
  }
  const tone = getSkinTone(grapheme);
  if (tone === 1) {
    return {
      emoji: found.emoji,
      shortcode: `:${found.name}:`,
      version: found.version,
    };
  }
  // An emoji whose tones aren't one modifier (two people, a tone each)
  // stays text rather than losing them
  return takesSkinTone(found.emoji)
    ? {
        emoji: applySkinTone(found.emoji, tone),
        shortcode: `:${found.name}:${skinToneShortcode(tone)}`,
        version: found.version,
      }
    : null;
}

let emojiPattern: RegExp | undefined;

/**
 * Matches each emoji of the database, in each skin tone it takes, longest
 * first. An emoji drawn as text by default (☺, ©) has to have its
 * variation selector to match; the others match with or without it.
 */
function getEmojiPattern(): RegExp {
  if (!emojiPattern) {
    const alternatives: string[] = [];
    for (const {emoji, skinTones} of getEmojiData()) {
      for (const variant of skinTones
        ? SKIN_TONES.map(tone => applySkinTone(emoji, tone))
        : [emoji]) {
        alternatives.push(variant);
      }
    }
    alternatives.sort((a, b) => b.length - a.length);
    emojiPattern = new RegExp(
      alternatives
        .map(emoji => {
          const chars = Array.from(emoji);
          const emojiStyle = chars.some(
            char => (char.codePointAt(0) ?? 0) >= 0x1f000,
          );
          return chars
            .map(char =>
              char === VARIATION_SELECTOR
                ? emojiStyle
                  ? '\\u{FE0F}?'
                  : '\\u{FE0F}'
                : `\\u{${(char.codePointAt(0) ?? 0).toString(16)}}`,
            )
            .join('');
        })
        .join('|'),
      'u',
    );
  }
  return emojiPattern;
}

export interface UnicodeMatch {
  readonly emoji: string;
  readonly shortcode: string;
  readonly position: number;
  /** How long the emoji is in the text */
  readonly length: number;
}

/** The first Unicode emoji of the database in a text */
export function findUnicodeEmoji(text: string): UnicodeMatch | null {
  const match = getEmojiPattern().exec(text);
  const found = match && lookUpEmoji(match[0]);
  return match && found
    ? {...found, length: match[0].length, position: match.index}
    : null;
}
