import type {CustomEmojiMap} from './customEmoji.ts';
import type {EmojiEntryParser} from './emojiEntries.ts';

import {$getSelection, $isRangeSelection, type TextNode} from 'lexical';

import {$createCustomEmojiNode} from './CustomEmojiNode.ts';
import {$createEmojiNode} from './EmojiNode.ts';
import {createEmojiMatcher} from './findEmoji.ts';

/**
 * Returns a {@link TextNode} transform that replaces the shortcodes that
 * `parseEntry` produces with an {@link EmojiNode}, and the `:name:` of each
 * of the `customEmoji` with a {@link CustomEmojiNode}
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
    if (custom) {
      const selection = $getSelection();
      const hadCaret =
        $isRangeSelection(selection) &&
        selection.isCollapsed() &&
        selection.anchor.key === targetNode.getKey();
      const customNode = targetNode.replace(
        $createCustomEmojiNode(custom.name),
      );
      if (hadCaret) {
        // A decorator can't hold the caret, so keep typing after it
        customNode.selectNext(0, 0);
      }
    } else {
      targetNode.replace(
        $createEmojiNode(emoji, shortcode)
          .setFormat(targetNode.getFormat())
          .setStyle(targetNode.getStyle()),
      );
    }
  };
}
