import type {SkinTone} from './skinToneNames.ts';

import {getEmojiData} from './emojiData.ts';

const FIRST_MODIFIER = 0x1f3fb;
const VARIATION_SELECTOR = '\uFE0F';

const isModifier = (char: string) => {
  const cp = char.codePointAt(0) ?? 0;
  return cp >= FIRST_MODIFIER && cp < FIRST_MODIFIER + 5;
};

/** The emoji without any skin tone */
function stripSkinTone(emoji: string): string {
  return Array.from(emoji)
    .filter(char => !isModifier(char))
    .join('');
}

/** The skin tone of an emoji, 1 if it has none */
export function getSkinTone(emoji: string): SkinTone {
  for (const char of emoji) {
    if (isModifier(char)) {
      return ((char.codePointAt(0) ?? 0) - FIRST_MODIFIER + 2) as SkinTone;
    }
  }
  return 1;
}

let toneable: Map<string, string> | undefined;

/** The emoji of the database that takes skin tones, if `emoji` is one */
function toneableBase(emoji: string): string | undefined {
  if (!toneable) {
    toneable = new Map();
    for (const data of getEmojiData()) {
      if (data.skinTones) {
        toneable.set(data.emoji.replaceAll(VARIATION_SELECTOR, ''), data.emoji);
      }
    }
  }
  return toneable.get(stripSkinTone(emoji).replaceAll(VARIATION_SELECTOR, ''));
}

/** Whether an emoji, with or without a skin tone, takes skin tones */
export function takesSkinTone(emoji: string): boolean {
  return toneableBase(emoji) !== undefined;
}

/**
 * The emoji with `tone` (replacing any it has), as the database spells it:
 * the tone follows its first code point. An emoji that takes no skin tone
 * is returned as it is.
 */
export function applySkinTone(emoji: string, tone: SkinTone): string {
  const base = toneableBase(emoji);
  if (base === undefined) {
    return emoji;
  }
  if (tone === 1) {
    return base;
  }
  const [first, ...rest] = Array.from(base);
  const tail = rest[0] === VARIATION_SELECTOR ? rest.slice(1) : rest;
  return [first, String.fromCodePoint(FIRST_MODIFIER + tone - 2), ...tail].join(
    '',
  );
}
