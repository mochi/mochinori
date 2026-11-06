import type {CustomEmojiMap} from './customEmoji.ts';
import type {EmojiEntryParser} from './emojiEntries.ts';
import type {SkinTone} from './skinToneNames.ts';

import {type LexicalNode, type TextNode} from 'lexical';

import {
  $createCustomEmojiNode,
  $createEmojiNode,
  $isEmojiNode,
  type EmojiNode,
} from './EmojiNode.ts';
import {createEmojiMatcher, type EmojiMatch} from './findEmoji.ts';
import {findUnicodeEmoji} from './findUnicodeEmoji.ts';
import {applySkinTone, getSkinTone, takesSkinTone} from './skinTone.ts';
import {SKIN_TONE_SHORTCODE, skinToneShortcode} from './skinToneNames.ts';

/**
 * The emoji node for a match. A short name, such as `:+1:` (not a text
 * such as `:)`), gets `skinTone` if its emoji takes one.
 */
export function $createEmojiNodeForMatch(
  match: EmojiMatch,
  skinTone: SkinTone,
): EmojiNode {
  const {custom, emoji, shortcode} = match;
  if (custom) {
    return $createCustomEmojiNode(custom.name);
  }
  if (
    skinTone !== 1 &&
    /^:[^:\s]+:$/.test(shortcode) &&
    getSkinTone(emoji) === 1 &&
    takesSkinTone(emoji)
  ) {
    return $createEmojiNode(
      applySkinTone(emoji, skinTone),
      shortcode + skinToneShortcode(skinTone),
    );
  }
  return $createEmojiNode(emoji, shortcode);
}

/**
 * Gives `prev` the skin tone of a `:skin-tone-N:` match that follows it, as
 * Slack does for `:+1::skin-tone-3:`, if `prev` is an emoji that takes one.
 * Returns whether it did.
 */
export function $addSkinTone(
  prev: LexicalNode | null,
  match: EmojiMatch,
): boolean {
  const tone = SKIN_TONE_SHORTCODE.exec(match.shortcode);
  if (
    !tone ||
    tone.index !== 0 ||
    !$isEmojiNode(prev) ||
    prev.isCustom() ||
    !takesSkinTone(prev.getTextContent())
  ) {
    return false;
  }
  prev.setTextContent(
    applySkinTone(prev.getTextContent(), Number(tone[1]) as SkinTone),
  );
  const shortcode = prev.getShortcode();
  if (shortcode) {
    prev.setShortcode(
      shortcode.replace(SKIN_TONE_SHORTCODE, '') + match.shortcode,
    );
  }
  return true;
}

/**
 * Returns a {@link TextNode} transform that replaces the shortcodes that
 * `parseEntry` produces with an {@link EmojiNode}, and the `:name:` of each
 * of the `customEmoji` with a custom emoji. Short names get the skin tone
 * that `getSkinTone` returns, and a `:skin-tone-N:` right after an emoji
 * gives it that tone. With `convertUnicode`, Unicode emoji of the database,
 * such as 👍 typed with the system's emoji picker or pasted, become emoji
 * nodes too.
 */
export function createTextNodeTransform(
  parseEntry: EmojiEntryParser,
  customEmoji?: CustomEmojiMap,
  getDefaultSkinTone: () => SkinTone = () => 1,
  convertUnicode = false,
): (node: TextNode) => void {
  const findEmoji = createEmojiMatcher(parseEntry, customEmoji);
  return function $textNodeTransform(node: TextNode): void {
    if (!node.isSimpleText() || node.hasFormat('code')) {
      return;
    }

    // Find only 1st occurrence as transform will be re-run anyway for the rest
    // because newly inserted nodes are considered to be dirty
    const text = node.getTextContent();
    let shortcodeMatch = findEmoji(text);
    const unicode = convertUnicode ? findUnicodeEmoji(text) : null;
    if (
      unicode &&
      shortcodeMatch &&
      unicode.position < shortcodeMatch.position
    ) {
      shortcodeMatch = null;
    }
    const match = shortcodeMatch
      ? {...shortcodeMatch, length: shortcodeMatch.shortcode.length}
      : unicode;
    if (!match) {
      return;
    }

    const {length, position} = match;
    const [targetNode] =
      position === 0
        ? // First text chunk within string, splitting into 2 parts
          node.splitText(length)
        : // In the middle of a string
          node.splitText(position, position + length).slice(1);
    if (targetNode === undefined) {
      return;
    }
    if (
      shortcodeMatch &&
      $addSkinTone(targetNode.getPreviousSibling(), shortcodeMatch)
    ) {
      targetNode.remove();
      return;
    }
    targetNode.replace(
      (shortcodeMatch
        ? $createEmojiNodeForMatch(shortcodeMatch, getDefaultSkinTone())
        : $createEmojiNode(match.emoji, match.shortcode)
      )
        .setFormat(targetNode.getFormat())
        .setStyle(targetNode.getStyle()),
    );
  };
}
