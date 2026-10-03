import {
  CoreImportExtension,
  defineImportRule,
  DOMImportExtension,
  sel,
} from '@lexical/html';
import {$isTextNode, configExtension, defineExtension} from 'lexical';

import {$createCustomEmojiNode} from './CustomEmojiNode.ts';
import {EmojiExtension} from './EmojiExtension.ts';
import {$createEmojiNode} from './EmojiNode.ts';

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
 * Imports the `<span data-custom-emoji>` that {@link CustomEmojiNode}
 * exports as a {@link CustomEmojiNode}, by name, so it shows the editor's
 * own image for that name
 */
export const CustomEmojiImportRule = defineImportRule({
  $import: (_ctx, el, $next) => {
    const name = el.getAttribute('data-custom-emoji');
    return name ? [$createCustomEmojiNode(name)] : $next();
  },
  match: sel.any().attr('data-custom-emoji', true),
  name: '@mochinori/emoji/custom-emoji',
});

export const EmojiImportRules = [EmojiImportRule, CustomEmojiImportRule];

/**
 * Adds emoji import to {@link DOMImportExtension}, for HTML paste and
 * `$generateNodesFromDOM`. Emoji are not imported through the legacy
 * `importDOM` path.
 */
export const EmojiImportExtension = defineExtension({
  dependencies: [
    EmojiExtension,
    CoreImportExtension,
    configExtension(DOMImportExtension, {rules: EmojiImportRules}),
  ],
  name: '@mochinori/emoji/EmojiImport',
});
