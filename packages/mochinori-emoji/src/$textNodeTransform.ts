import type {CustomEmojiMap} from './customEmoji.ts';
import type {EmojiEntryParser} from './emojiEntries.ts';
import type {TextNode} from 'lexical';

import {$createCustomEmojiNode, $createEmojiNode} from './EmojiNode.ts';
import {createEmojiMatcher} from './findEmoji.ts';

/**
 * Returns a {@link TextNode} transform that replaces the shortcodes that
 * `parseEntry` produces with an {@link EmojiNode}, and the `:name:` of each
 * of the `customEmoji` with a custom emoji
 */
export function createTextNodeTransform(
  parseEntry: EmojiEntryParser,
  customEmoji?: CustomEmojiMap,
): (node: TextNode) => void {
  const findEmoji = createEmojiMatcher(parseEntry, customEmoji);
  return function $textNodeTransform(node: TextNode): void {
    if (!node.isSimpleText() || node.hasFormat('code')) {
      return;
    }

    // Find only 1st occurrence as transform will be re-run anyway for the rest
    // because newly inserted nodes are considered to be dirty
    const emojiMatch = findEmoji(node.getTextContent());
    if (emojiMatch === null) {
      return;
    }

    const {custom, emoji, position, shortcode} = emojiMatch;
    const [targetNode] =
      position === 0
        ? // First text chunk within string, splitting into 2 parts
          node.splitText(shortcode.length)
        : // In the middle of a string
          node.splitText(position, position + shortcode.length).slice(1);
    if (targetNode === undefined) {
      return;
    }
    targetNode.replace(
      (custom
        ? $createCustomEmojiNode(custom.name)
        : $createEmojiNode(emoji, shortcode)
      )
        .setFormat(targetNode.getFormat())
        .setStyle(targetNode.getStyle()),
    );
  };
}
