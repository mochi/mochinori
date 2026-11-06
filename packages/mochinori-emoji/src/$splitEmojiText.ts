import type {CustomEmojiMap} from './customEmoji.ts';
import type {EmojiEntryParser} from './emojiEntries.ts';

import {$createTextNode, type LexicalNode, type TextNode} from 'lexical';

import {$addSkinTone, $createEmojiNodeForMatch} from './$textNodeTransform.ts';
import {getEmojiData} from './emojiData.ts';
import {$createEmojiNode} from './EmojiNode.ts';
import {createEmojiMatcher, type EmojiMatch} from './findEmoji.ts';
import {applySkinTone, getSkinTone, takesSkinTone} from './skinTone.ts';
import {SKIN_TONES, skinToneShortcode} from './skinToneNames.ts';

const VARIATION_SELECTOR = '️';
const SKIN_TONE_MODIFIERS = /[\u{1F3FB}-\u{1F3FF}]/gu;

let byKey: Map<string, {emoji: string; name: string}> | undefined;

/** An emoji with no variation selector or skin tone, to look it up by */
function keyOf(emoji: string): string {
  return emoji
    .replaceAll(VARIATION_SELECTOR, '')
    .replace(SKIN_TONE_MODIFIERS, '');
}

/**
 * The emoji of the database that a grapheme is, as the database spells it,
 * and its shortcode
 */
function lookUpEmoji(
  grapheme: string,
): {emoji: string; shortcode: string} | null {
  if (!byKey) {
    byKey = new Map();
    for (const {emoji, shortNames} of getEmojiData()) {
      if (shortNames[0]) {
        byKey.set(keyOf(emoji), {emoji, name: shortNames[0]});
      }
    }
  }
  const found = byKey.get(keyOf(grapheme));
  if (!found) {
    return null;
  }
  const tone = getSkinTone(grapheme);
  if (tone === 1) {
    return {emoji: found.emoji, shortcode: `:${found.name}:`};
  }
  // An emoji whose tones aren't one modifier (two people, a tone each)
  // stays text rather than losing them
  return takesSkinTone(found.emoji)
    ? {
        emoji: applySkinTone(found.emoji, tone),
        shortcode: `:${found.name}:${skinToneShortcode(tone)}`,
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

interface UnicodeMatch {
  readonly emoji: string;
  readonly shortcode: string;
  readonly position: number;
  /** How long the emoji is in the text */
  readonly length: number;
}

/** The first Unicode emoji of the database in a text */
function findUnicodeEmoji(text: string): UnicodeMatch | null {
  const match = getEmojiPattern().exec(text);
  const found = match && lookUpEmoji(match[0]);
  return match && found
    ? {...found, length: match[0].length, position: match.index}
    : null;
}

/**
 * Returns a function that splits a text node, such as one that Markdown
 * import made, into text and emoji nodes: for the shortcodes that
 * `parseEntry` produces, the `:name:` of each of the `customEmoji`, and
 * each Unicode emoji of the database, so an emoji exported as Unicode
 * comes back as an emoji node. A `:skin-tone-N:` right after an emoji gives
 * it that tone, but no default skin tone applies. A node with no emoji is
 * returned as it is.
 */
export function createEmojiTextSplitter(
  parseEntry: EmojiEntryParser,
  customEmoji?: CustomEmojiMap,
): (node: TextNode) => LexicalNode[] {
  const findEmoji = createEmojiMatcher(parseEntry, customEmoji);
  return function $splitEmojiText(node: TextNode): LexicalNode[] {
    if (!node.isSimpleText() || node.hasFormat('code')) {
      return [node];
    }
    const format = node.getFormat();
    const style = node.getStyle();
    const output: LexicalNode[] = [];
    let rest = node.getTextContent();
    for (;;) {
      const shortcode: EmojiMatch | null = findEmoji(rest);
      const unicode = findUnicodeEmoji(rest);
      if (!shortcode && !unicode) {
        break;
      }
      const position = Math.min(
        shortcode?.position ?? Infinity,
        unicode?.position ?? Infinity,
      );
      const before = rest.slice(0, position);
      if (before) {
        output.push($createTextNode(before).setFormat(format).setStyle(style));
      }
      if (shortcode && shortcode.position === position) {
        if (
          before ||
          !$addSkinTone(output[output.length - 1] ?? null, shortcode)
        ) {
          output.push(
            $createEmojiNodeForMatch(shortcode, 1)
              .setFormat(format)
              .setStyle(style),
          );
        }
        rest = rest.slice(position + shortcode.shortcode.length);
      } else if (unicode) {
        output.push(
          $createEmojiNode(unicode.emoji, unicode.shortcode)
            .setFormat(format)
            .setStyle(style),
        );
        rest = rest.slice(position + unicode.length);
      }
    }
    if (output.length === 0) {
      return [node];
    }
    if (rest) {
      output.push($createTextNode(rest).setFormat(format).setStyle(style));
    }
    return output;
  };
}
