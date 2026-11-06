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
import {EmojiMdastExtension} from '../../mdast.ts';

const PARROT: CustomEmoji = {name: 'partyparrot', src: 'parrot.gif'};

function buildEditor() {
  const editor = buildEditorFromExtensions(
    defineExtension({
      dependencies: [
        configExtension(EmojiExtension, {customEmoji: [PARROT]}),
        EmojiMdastExtension,
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
    // Keycaps have no Facebook image, so they aren't in the database
    importMarkdown(editor, '👨‍👩‍👧 👨 #️⃣ ☺ ☺️ 👍🏽‍');
    expect(
      describeText(editor).map(node =>
        typeof node === 'string' ? node : node.shortcode,
      ),
    ).toEqual([
      ':man-woman-girl:',
      ' ',
      ':man:',
      ' #️⃣ ☺ ',
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
});
