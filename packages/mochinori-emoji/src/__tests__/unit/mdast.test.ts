// @vitest-environment node

import {
  buildEditorFromExtensions,
  getExtensionDependencyFromEditor,
} from '@lexical/extension';
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  MdastExtension,
} from '@lexical/mdast';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  configExtension,
  defineExtension,
  IS_BOLD,
  type LexicalEditor,
} from 'lexical';
import {beforeAll, describe, expect, it} from 'vitest';

import {
  $createCustomEmojiNode,
  $createEmojiNode,
  $isCustomEmojiNode,
  $isEmojiNode,
  type CustomEmoji,
  EmojiExtension,
} from '../../index.ts';
import {loadEmojiDatabase} from '../../loadEmojiDatabase.ts';
import {type EmojiMdastConfig, EmojiMdastExtension} from '../../mdast.ts';

const PARROT: CustomEmoji = {name: 'partyparrot', src: 'parrot.gif'};

function buildEditor(mdastConfig: Partial<EmojiMdastConfig> = {}) {
  const editor = buildEditorFromExtensions(
    defineExtension({
      dependencies: [
        configExtension(EmojiExtension, {customEmoji: [PARROT]}),
        configExtension(EmojiMdastExtension, mdastConfig),
        MdastExtension,
      ],
      name: '[root]',
    }),
  );
  // Imported documents are read, not typed: no shortcode transform helps
  editor.setEditable(false);
  return editor;
}

function describeText(editor: LexicalEditor) {
  return editor.read(() =>
    $getRoot()
      .getChildren()
      .flatMap(p => ($isElementNode(p) ? p.getChildren() : []))
      .map(node =>
        $isCustomEmojiNode(node)
          ? {custom: node.getName(), format: node.getFormat()}
          : $isEmojiNode(node)
            ? {
                emoji: node.getTextContent(),
                format: node.getFormat(),
                shortcode: node.getShortcode(),
              }
            : node.getTextContent(),
      ),
  );
}

function importMarkdown(editor: LexicalEditor, markdown: string) {
  editor.update(() => $convertFromMarkdownString(markdown), {discrete: true});
}

function exportMarkdown(editor: LexicalEditor) {
  return editor.read(() => $convertToMarkdownString());
}

describe('EmojiMdastExtension', () => {
  beforeAll(async () => {
    await loadEmojiDatabase();
  });

  it('exports Unicode emoji as themselves and custom emoji by name', () => {
    using editor = buildEditor();
    editor.update(
      () => {
        $getRoot()
          .clear()
          .append(
            $createParagraphNode().append(
              $createTextNode('hi '),
              $createEmojiNode('👍🏼', ':+1::skin-tone-3:'),
              $createTextNode(' '),
              $createCustomEmojiNode('partyparrot'),
              $createTextNode(' '),
              $createEmojiNode('🍎', ':apple:').setFormat(IS_BOLD),
            ),
          );
      },
      {discrete: true},
    );
    expect(exportMarkdown(editor)).toBe('hi 👍🏼 :partyparrot: **🍎**');
  });

  it('imports shortcodes, custom emoji and Unicode emoji as emoji', () => {
    using editor = buildEditor();
    importMarkdown(
      editor,
      'hi :+1: 👍🏽:partyparrot: :wave::skin-tone-2: **🍎** :nope: © `:smile:`',
    );
    expect(describeText(editor)).toEqual([
      'hi ',
      {emoji: '👍', format: 0, shortcode: ':+1:'},
      ' ',
      {emoji: '👍🏽', format: 0, shortcode: ':+1::skin-tone-4:'},
      {custom: 'partyparrot', format: 0},
      ' ',
      {emoji: '👋🏻', format: 0, shortcode: ':wave::skin-tone-2:'},
      ' ',
      {emoji: '🍎', format: IS_BOLD, shortcode: ':apple:'},
      // Unknown names, text-style symbols and code stay text
      ' :nope: © ',
      ':smile:',
    ]);
  });

  it('imports the longest emoji, and text-style symbols only as emoji', () => {
    using editor = buildEditor();
    // A keycap is an emoji, but not the # it starts with
    importMarkdown(editor, '👨‍👩‍👧 👨 #️⃣ # ☺ ☺️ 👍🏽‍');
    expect(
      describeText(editor).map(node =>
        typeof node === 'string' ? node : node.shortcode,
      ),
    ).toEqual([
      ':man-woman-girl:',
      ' ',
      ':man:',
      ' ',
      ':hash:',
      ' # ☺ ',
      ':relaxed:',
      ' ',
      ':+1::skin-tone-4:',
      '\u200D',
    ]);
  });

  it('round-trips emoji through Markdown', () => {
    using editor = buildEditor();
    const markdown = 'a 🙂 b :partyparrot: c **👍🏿** 🇯🇵';
    importMarkdown(editor, markdown);
    const imported = describeText(editor);
    expect(imported.filter(node => typeof node !== 'string')).toHaveLength(4);
    expect(exportMarkdown(editor)).toBe(markdown);
    importMarkdown(editor, exportMarkdown(editor));
    expect(describeText(editor)).toEqual(imported);
  });

  it('splits a text node that an app imports itself', () => {
    using editor = buildEditor();
    const {$createEmojiNodesFromText} = getExtensionDependencyFromEditor(
      editor,
      EmojiExtension,
    ).output;
    editor.update(
      () => {
        const nodes = $createEmojiNodesFromText($createTextNode('x :+1: 👍'));
        expect(nodes.map(node => node.getTextContent())).toEqual([
          'x ',
          '👍',
          ' ',
          '👍',
        ]);
        expect(nodes.filter(node => $isEmojiNode(node))).toHaveLength(2);
      },
      {discrete: true},
    );
  });

  it('exports standard emoji as shortcodes when asked, like Slack', () => {
    using editor = buildEditor({exportFormat: 'shortcode'});
    editor.update(
      () => {
        $getRoot()
          .clear()
          .append(
            $createParagraphNode().append(
              $createTextNode('hi '),
              $createEmojiNode('👍🏼', ':+1::skin-tone-3:'),
              $createTextNode(' '),
              $createCustomEmojiNode('partyparrot'),
              $createTextNode(' '),
              // Matched from a text, it still exports by its short name
              $createEmojiNode('🙂', ':)'),
              $createEmojiNode('🍎', ':apple:').setFormat(IS_BOLD),
              $createEmojiNode('😼'),
            ),
          );
      },
      {discrete: true},
    );
    const markdown = exportMarkdown(editor);
    expect(markdown).toBe(
      'hi :+1::skin-tone-3: :partyparrot: :slightly_smiling_face:**:apple:**:smirk_cat:',
    );
    importMarkdown(editor, markdown);
    expect(
      describeText(editor).map(node =>
        typeof node === 'string' || 'custom' in node ? node : node.emoji,
      ),
    ).toEqual([
      'hi ',
      '👍🏼',
      ' ',
      {custom: 'partyparrot', format: 0},
      ' ',
      '🙂',
      '🍎',
      '😼',
    ]);
    // The format can change while the editor runs
    getExtensionDependencyFromEditor(
      editor,
      EmojiMdastExtension,
    ).output.exportFormat.value = 'unicode';
    expect(exportMarkdown(editor)).toBe('hi 👍🏼 :partyparrot: 🙂**🍎**😼');
  });

  it('leaves Unicode emoji as text without convertUnicodeEmoji', () => {
    using editor = buildEditorFromExtensions(
      defineExtension({
        dependencies: [
          configExtension(EmojiExtension, {
            convertUnicodeEmoji: false,
            customEmoji: [PARROT],
          }),
          EmojiMdastExtension,
          MdastExtension,
        ],
        name: '[root]',
      }),
    );
    editor.setEditable(false);
    importMarkdown(editor, 'a :+1: 👍 :partyparrot:');
    expect(
      describeText(editor).map(node =>
        typeof node === 'string' ? node : 'emoji',
      ),
    ).toEqual(['a ', 'emoji', ' 👍 ', 'emoji']);
  });
});
