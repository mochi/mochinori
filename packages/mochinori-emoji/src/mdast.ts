import {$getExtensionOutput, namedSignals} from '@lexical/extension';
import {
  type MdastExportRule,
  MdastExtension,
  type MdastImportRule,
  type MdastNode,
} from '@lexical/mdast';
import {$isTextNode, configExtension, defineExtension, safeCast} from 'lexical';

import {EmojiExtension} from './EmojiExtension.ts';
import {$isEmojiNode, EmojiNode} from './EmojiNode.ts';

export interface EmojiMdastConfig {
  /**
   * How standard emoji export: `'unicode'` writes the emoji itself (👍),
   * which any Markdown reader shows, as Discord and GitHub store them;
   * `'shortcode'` writes its short name (`:+1:`, and `:+1::skin-tone-3:` for
   * 👍🏼), as Slack stores them. Custom emoji have no Unicode, so they
   * always export as their `:name:`. An emoji that isn't in the database,
   * or any emoji before the database has loaded, exports as Unicode.
   * Default: `'unicode'`.
   */
  exportFormat: 'unicode' | 'shortcode';
}

/** The text of each `text` node of `nodes`, the emoji's phrasing, replaced */
function replaceText(nodes: MdastNode[], value: string): MdastNode[] {
  return nodes.map(node =>
    node.type === 'text'
      ? {...node, value}
      : 'children' in node
        ? ({
            ...node,
            children: replaceText(node.children as MdastNode[], value),
          } as MdastNode)
        : node,
  );
}

/**
 * Imports the Markdown text that has emoji in it as emoji nodes: shortcodes
 * such as `:+1:` and `:+1::skin-tone-3:`, custom emoji `:name:`, and Unicode
 * emoji such as 👍 unless `EmojiExtension`'s `convertUnicodeEmoji` is off,
 * the same as typing and pasting. It runs after the other `text` rules, on
 * the text nodes they make.
 */
export const EmojiMdastImportRule: MdastImportRule = {
  $import: (_node, context) => {
    const {$createEmojiNodesFromText, convertUnicodeEmoji} =
      $getExtensionOutput(EmojiExtension);
    const options = {unicode: convertUnicodeEmoji.peek()};
    return context
      .next()
      .flatMap(node =>
        $isTextNode(node) ? $createEmojiNodesFromText(node, options) : [node],
      );
  },
  type: 'text',
};

/**
 * Exports standard emoji as their shortcode when
 * {@link EmojiMdastConfig.exportFormat} is `'shortcode'`, keeping their text
 * format. Otherwise it leaves emoji to the default text export: Unicode, or
 * the `:name:` of a custom emoji. It needs {@link EmojiMdastExtension} in
 * the editor.
 */
export const EmojiMdastExportRule: MdastExportRule = {
  $export: (node: EmojiNode, context) => {
    if (
      $getExtensionOutput(EmojiMdastExtension).exportFormat.peek() !==
        'shortcode' ||
      !$isEmojiNode(node) ||
      node.isCustom()
    ) {
      return context.next();
    }
    const shortcode = $getExtensionOutput(EmojiExtension).getEmojiShortcode(
      node.getTextContent(),
    );
    return shortcode ? replaceText(context.next(), shortcode) : context.next();
  },
  type: EmojiNode,
};

/**
 * Markdown for emoji with `@lexical/mdast`. By default emoji export as
 * their text: a Unicode emoji as itself (👍), which any Markdown reader
 * shows, and a custom emoji as its `:name:`, as Slack, Discord and GitHub
 * write them. Import turns both back into emoji nodes, along with
 * shortcodes. {@link EmojiMdastConfig} changes each of these; its output
 * has a signal for each option, to change it while the editor runs.
 *
 * Import needs the emoji database, which browsers load when the editor is
 * created: until `searchEmoji` in `EmojiExtension`'s output is set,
 * imported emoji stay text, and only convert later while the editor is
 * editable.
 */
export const EmojiMdastExtension = defineExtension({
  build: (_editor, config) => namedSignals(config),
  config: safeCast<EmojiMdastConfig>({
    exportFormat: 'unicode',
  }),
  dependencies: [
    EmojiExtension,
    configExtension(MdastExtension, {
      exportRules: [EmojiMdastExportRule],
      importRules: [EmojiMdastImportRule],
    }),
  ],
  name: '@mochinori/emoji/EmojiMdast',
});
