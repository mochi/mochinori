import type {CustomEmojiMap} from './customEmoji.ts';
import type {EmojiEntryParser} from './emojiEntries.ts';

import {$createTextNode, type LexicalNode, type TextNode} from 'lexical';

import {$addSkinTone, $createEmojiNodeForMatch} from './$textNodeTransform.ts';
import {$createEmojiNode} from './EmojiNode.ts';
import {createEmojiMatcher, type EmojiMatch} from './findEmoji.ts';
import {findUnicodeEmoji} from './findUnicodeEmoji.ts';

/** Which emoji {@link createEmojiTextSplitter} turns into emoji nodes */
export interface SplitEmojiTextOptions {
  /**
   * Shortcodes and texts such as `:+1:` and `:)`, and custom emoji
   * `:name:`. Default: true.
   */
  readonly shortcodes?: boolean;
  /** Unicode emoji such as 👍. Default: true. */
  readonly unicode?: boolean;
}

/**
 * Returns a function that splits a text node, such as one that Markdown
 * import made, into text and emoji nodes: for the shortcodes that
 * `parseEntry` produces, the `:name:` of each of the `customEmoji`, and
 * each Unicode emoji of the database, so an emoji exported as Unicode
 * comes back as an emoji node. `options` can leave out either kind. A
 * `:skin-tone-N:` right after an emoji gives it that tone, but no default
 * skin tone applies. A node with no emoji is returned as it is.
 */
export function createEmojiTextSplitter(
  parseEntry: EmojiEntryParser,
  customEmoji?: CustomEmojiMap,
): (node: TextNode, options?: SplitEmojiTextOptions) => LexicalNode[] {
  const findEmoji = createEmojiMatcher(parseEntry, customEmoji);
  return function $splitEmojiText(
    node: TextNode,
    {shortcodes = true, unicode: withUnicode = true} = {},
  ): LexicalNode[] {
    if (
      !node.isSimpleText() ||
      node.hasFormat('code') ||
      (!shortcodes && !withUnicode)
    ) {
      return [node];
    }
    const format = node.getFormat();
    const style = node.getStyle();
    const output: LexicalNode[] = [];
    let rest = node.getTextContent();
    for (;;) {
      const shortcode: EmojiMatch | null = shortcodes ? findEmoji(rest) : null;
      const unicode = withUnicode ? findUnicodeEmoji(rest) : null;
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
