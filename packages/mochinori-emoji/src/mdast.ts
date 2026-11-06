import {$getExtensionOutput} from '@lexical/extension';
import {MdastExtension, type MdastImportRule} from '@lexical/mdast';
import {$isTextNode, configExtension, defineExtension} from 'lexical';

import {EmojiExtension} from './EmojiExtension.ts';

/**
 * Imports the Markdown text that has emoji in it as emoji nodes: shortcodes
 * such as `:+1:` and `:+1::skin-tone-3:`, custom emoji `:name:`, and Unicode
 * emoji such as 👍, the way emoji nodes export. It runs after the other
 * `text` rules, on the text nodes they make.
 */
export const EmojiMdastImportRule: MdastImportRule = {
  $import: (_node, context) => {
    const {$createEmojiNodesFromText} = $getExtensionOutput(EmojiExtension);
    return context
      .next()
      .flatMap(node =>
        $isTextNode(node) ? $createEmojiNodesFromText(node) : [node],
      );
  },
  type: 'text',
};

/**
 * Markdown for emoji with `@lexical/mdast`. Emoji export as their text: a
 * Unicode emoji as itself (👍), which any Markdown reader shows, and a
 * custom emoji as its `:name:`, as Slack, Discord and GitHub write them.
 * Import turns both back into emoji nodes, along with shortcodes, through
 * {@link EmojiMdastImportRule}.
 *
 * Import needs the emoji database, which browsers load when the editor is
 * created: until `searchEmoji` in `EmojiExtension`'s output is set,
 * imported emoji stay text, and only shortcodes convert later (while the
 * editor is editable).
 */
export const EmojiMdastExtension = defineExtension({
  dependencies: [
    EmojiExtension,
    configExtension(MdastExtension, {importRules: [EmojiMdastImportRule]}),
  ],
  name: '@mochinori/emoji/EmojiMdast',
});
