import {defineImportRule, sel} from '@lexical/html';
import {$isTextNode} from 'lexical';

import {$createCustomEmojiNode, $createEmojiNode} from './EmojiNode.ts';

/**
 * Imports the element with a `data-emoji-shortcode` that {@link EmojiNode}
 * exports (a `<span>`, or a `<strong>` and the like when formatted)
 * as an {@link EmojiNode}, keeping the text format and style that the rest
 * of the import gives it
 */
export const EmojiImportRule = defineImportRule({
  $import: (_ctx, el, $next) => {
    const out = $next();
    const {textContent} = el;
    const shortcode = el.getAttribute('data-emoji-shortcode');
    const [node] = out;
    if (
      out.length === 1 &&
      $isTextNode(node) &&
      textContent &&
      shortcode &&
      node.getTextContent() === textContent
    ) {
      return [
        $createEmojiNode(textContent, shortcode)
          .setFormat(node.getFormat())
          .setStyle(node.getStyle()),
      ];
    }
    return out;
  },
  match: sel.any().attr('data-emoji-shortcode', true),
  name: '@mochinori/emoji/emoji',
});

/**
 * Imports the element with a `data-custom-emoji` that a custom emoji exports
 * as a custom emoji, by name, so it shows the editor's own image for that
 * name. It keeps the text format and style that the rest of the import gives
 * its text.
 */
export const CustomEmojiImportRule = defineImportRule({
  $import: (_ctx, el, $next) => {
    const name = el.getAttribute('data-custom-emoji');
    const out = $next();
    if (!name) {
      return out;
    }
    const text = out.find($isTextNode);
    const node = $createCustomEmojiNode(name);
    return [
      text ? node.setFormat(text.getFormat()).setStyle(text.getStyle()) : node,
    ];
  },
  match: sel.any().attr('data-custom-emoji', true),
  name: '@mochinori/emoji/custom-emoji',
});

export const EmojiImportRules = [EmojiImportRule, CustomEmojiImportRule];
