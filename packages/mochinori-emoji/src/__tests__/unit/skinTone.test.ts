import {
  buildEditorFromExtensions,
  getExtensionDependencyFromEditor,
} from '@lexical/extension';
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  configExtension,
  defineExtension,
  KEY_ENTER_COMMAND,
  type LexicalEditor,
} from 'lexical';
import {beforeAll, describe, expect, it} from 'vitest';

import {
  $isCustomEmojiNode,
  $isEmojiNode,
  EmojiExtension,
  type EmojiExtensionConfig,
  EmojiTypeaheadExtension,
  getEmojiCategories,
  INSERT_EMOJI_COMMAND,
  searchEmoji,
} from '../../index.ts';
import {loadEmojiDatabase} from '../../loadEmojiDatabase.ts';
import {applySkinTone, getSkinTone, takesSkinTone} from '../../skinTone.ts';

function buildEditor(config: Partial<EmojiExtensionConfig> = {}) {
  const editor = buildEditorFromExtensions(
    defineExtension({
      dependencies: [
        configExtension(EmojiExtension, config),
        EmojiTypeaheadExtension,
      ],
      name: '[root]',
    }),
  );
  editor.update(
    () => {
      $getRoot().clear().append($createParagraphNode()).selectEnd();
    },
    {discrete: true},
  );
  return editor;
}

// Types `text` one character at a time at the caret
function type(editor: LexicalEditor, text: string) {
  for (const char of text) {
    editor.update(
      () => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          selection.insertText(char);
        }
      },
      {discrete: true},
    );
  }
}

function describeText(editor: LexicalEditor) {
  return editor.read(() =>
    $getRoot()
      .getChildren()
      .flatMap(p => ($isElementNode(p) ? p.getChildren() : []))
      .map(node =>
        $isCustomEmojiNode(node)
          ? {custom: node.getName()}
          : $isEmojiNode(node)
            ? {emoji: node.getTextContent(), shortcode: node.getShortcode()}
            : node.getTextContent(),
      ),
  );
}

function emojiOutput(editor: LexicalEditor) {
  return getExtensionDependencyFromEditor(editor, EmojiExtension).output;
}

describe('skin tones', () => {
  beforeAll(async () => {
    await loadEmojiDatabase();
  });

  it('puts the tone after the first code point, as the database does', () => {
    expect(applySkinTone('👍', 4)).toBe('👍🏽');
    // The variation selector after the first code point goes
    expect(applySkinTone('☝️', 2)).toBe('☝🏻');
    expect(applySkinTone('🤦‍♂️', 6)).toBe('🤦🏿‍♂️');
    // Replacing a tone, or removing it
    expect(applySkinTone('👍🏽', 2)).toBe('👍🏻');
    expect(applySkinTone('☝🏻', 1)).toBe('☝️');
    expect(getSkinTone('👍🏽')).toBe(4);
    expect(getSkinTone('👍')).toBe(1);
  });

  it('leaves emoji that take no single tone as they are', () => {
    expect(takesSkinTone('🍎')).toBe(false);
    expect(applySkinTone('🍎', 3)).toBe('🍎');
    // Two people with a tone each
    expect(takesSkinTone('🧑‍🤝‍🧑')).toBe(false);
    expect(applySkinTone('🧑‍🤝‍🧑', 3)).toBe('🧑‍🤝‍🧑');
  });

  it('gives searches and categories the tone', () => {
    expect(searchEmoji('+1', {limit: 1, skinTone: 3})).toEqual([
      {emoji: '👍🏼', name: '+1', skinTone: 3},
    ]);
    expect(searchEmoji('apple', {limit: 1, skinTone: 3})).toEqual([
      {emoji: '🍎', name: 'apple'},
    ]);
    // The tone modifiers themselves are not suggested
    expect(searchEmoji('skin-tone')).toEqual([]);
    const categories = getEmojiCategories({skinTone: 5});
    expect(categories.map(c => c.name)).toEqual([
      'Smileys & Emotion',
      'People & Body',
      'Animals & Nature',
      'Food & Drink',
      'Travel & Places',
      'Activities',
      'Objects',
      'Symbols',
      'Flags',
    ]);
    expect(categories[0].emoji[0]).toEqual({emoji: '😀', name: 'grinning'});
    expect(categories[1].emoji[0]).toEqual({
      emoji: '👋🏾',
      name: 'wave',
      skinTone: 5,
    });
  });

  it('adds a typed :skin-tone-N: to the emoji before it', () => {
    using editor = buildEditor();
    type(editor, 'ok :+1::skin-tone-3: and');
    expect(describeText(editor)).toEqual([
      'ok ',
      {emoji: '👍🏼', shortcode: ':+1::skin-tone-3:'},
      ' and',
    ]);
    // And replaces the tone it had
    type(editor, ' :wave::skin-tone-2::skin-tone-6:');
    expect(describeText(editor).slice(-2)).toEqual([
      ' and ',
      {emoji: '👋🏿', shortcode: ':wave::skin-tone-6:'},
    ]);
  });

  it('keeps a :skin-tone-N: after an emoji that takes none', () => {
    using editor = buildEditor();
    type(editor, ':apple::skin-tone-3:');
    expect(describeText(editor)).toEqual([
      {emoji: '🍎', shortcode: ':apple:'},
      {emoji: '🏼', shortcode: ':skin-tone-3:'},
    ]);
  });

  it('gives typed short names the skin tone of the output signal', () => {
    using editor = buildEditor({skinTone: 5});
    type(editor, ':+1: :) :apple: ');
    expect(describeText(editor)).toEqual([
      {emoji: '👍🏾', shortcode: ':+1::skin-tone-5:'},
      ' ',
      // Texts such as :) never take a tone
      {emoji: '🙂', shortcode: ':)'},
      ' ',
      {emoji: '🍎', shortcode: ':apple:'},
      ' ',
    ]);
    emojiOutput(editor).skinTone.value = 1;
    type(editor, ':+1:');
    expect(describeText(editor).at(-1)).toEqual({
      emoji: '👍',
      shortcode: ':+1:',
    });
  });

  it('suggests and inserts emoji with the skin tone', () => {
    using editor = buildEditor({skinTone: 2});
    const {state} = getExtensionDependencyFromEditor(
      editor,
      EmojiTypeaheadExtension,
    ).output;
    type(editor, ':thumbsu');
    expect(state.value?.suggestions[0]).toMatchObject({
      emoji: '👍🏻',
      name: 'thumbsup',
      skinTone: 2,
    });
    editor.dispatchCommand(KEY_ENTER_COMMAND, null);
    const search = emojiOutput(editor).searchEmoji.value;
    const [wave] = search?.('wave', {limit: 1}) ?? [];
    editor.update(() => {
      editor.dispatchCommand(INSERT_EMOJI_COMMAND, wave);
    });
    expect(describeText(editor)).toEqual([
      {emoji: '👍🏻', shortcode: ':thumbsup::skin-tone-2:'},
      ' ',
      {emoji: '👋🏻', shortcode: ':wave::skin-tone-2:'},
    ]);
    expect(emojiOutput(editor).emojiCategories.value?.[1].emoji[0]).toEqual({
      emoji: '👋🏻',
      name: 'wave',
      skinTone: 2,
    });
  });
});
