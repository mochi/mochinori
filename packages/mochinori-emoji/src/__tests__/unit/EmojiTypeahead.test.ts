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
  $isTextNode,
  configExtension,
  defineExtension,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
  type LexicalEditor,
} from 'lexical';
import {beforeAll, describe, expect, it} from 'vitest';

import {
  $isCustomEmojiNode,
  $isEmojiNode,
  type CustomEmoji,
  EmojiExtension,
  type EmojiExtensionConfig,
  EmojiTypeaheadExtension,
  INSERT_EMOJI_COMMAND,
} from '../../index.ts';
import {loadEmojiDatabase} from '../../loadEmojiDatabase.ts';

const PARROT: CustomEmoji = {name: 'partyparrot', src: 'parrot.gif'};

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

function typeahead(editor: LexicalEditor) {
  return getExtensionDependencyFromEditor(editor, EmojiTypeaheadExtension)
    .output;
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

function press(
  editor: LexicalEditor,
  command:
    | typeof KEY_ARROW_DOWN_COMMAND
    | typeof KEY_ARROW_UP_COMMAND
    | typeof KEY_ENTER_COMMAND
    | typeof KEY_ESCAPE_COMMAND
    | typeof KEY_TAB_COMMAND,
  key: string,
) {
  const event = new KeyboardEvent('keydown', {cancelable: true, key});
  const handled = editor.dispatchCommand(command, event as never);
  return {handled, prevented: event.defaultPrevented};
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
            ? {emoji: node.getTextContent()}
            : node.getTextContent(),
      ),
  );
}

describe('EmojiTypeaheadExtension', () => {
  beforeAll(async () => {
    await loadEmojiDatabase();
  });

  it('opens once two characters follow the colon', () => {
    using editor = buildEditor();
    const {state} = typeahead(editor);
    type(editor, 'so :a');
    expect(state.value).toBe(null);
    type(editor, 'pp');
    expect(state.value?.query).toBe('app');
    expect(state.value?.selectedIndex).toBe(0);
    expect(state.value?.suggestions[0]).toEqual({
      emoji: '🍎',
      name: 'apple',
      src: expect.stringMatching(/\/1f34e\.png$/),
    });
    // Not after a letter or digit, as in x:ab or 10:30
    type(editor, ' x:ab');
    expect(state.value).toBe(null);
    type(editor, ' 10:30');
    expect(state.value).toBe(null);
  });

  it('opens right after another emoji', () => {
    using editor = buildEditor();
    const {state} = typeahead(editor);
    // An emoji typed with the system keyboard is plain text
    type(editor, '😀:pe');
    expect(state.value?.query).toBe('pe');
    press(editor, KEY_ENTER_COMMAND, 'Enter');
    // Right after an emoji node, and after a name that isn't an emoji
    type(editor, ':apple::nope::ap');
    expect(state.value?.query).toBe('ap');
    press(editor, KEY_ENTER_COMMAND, 'Enter');
    expect(describeText(editor)).toEqual([
      '😀',
      {emoji: '🍐'},
      ' ',
      {emoji: '🍎'},
      ':nope:',
      {emoji: '🍎'},
      ' ',
    ]);
  });

  it('moves with the arrow keys and picks with Enter', () => {
    using editor = buildEditor();
    const {state} = typeahead(editor);
    type(editor, 'so :app');
    expect(press(editor, KEY_ARROW_DOWN_COMMAND, 'ArrowDown')).toEqual({
      handled: true,
      prevented: true,
    });
    expect(state.value?.selectedIndex).toBe(1);
    press(editor, KEY_ARROW_UP_COMMAND, 'ArrowUp');
    press(editor, KEY_ARROW_UP_COMMAND, 'ArrowUp');
    // Wraps around
    expect(state.value?.selectedIndex).toBe(
      (state.value?.suggestions.length ?? 0) - 1,
    );
    press(editor, KEY_ARROW_DOWN_COMMAND, 'ArrowDown');
    press(editor, KEY_ARROW_DOWN_COMMAND, 'ArrowDown');
    expect(press(editor, KEY_ENTER_COMMAND, 'Enter').handled).toBe(true);
    expect(describeText(editor)).toEqual(['so ', {emoji: '🍏'}, ' ']);
    expect(state.value).toBe(null);
    // The caret is after the space, so typing goes on from there
    type(editor, 'ok');
    expect(describeText(editor)).toEqual(['so ', {emoji: '🍏'}, ' ok']);
  });

  it('picks with Tab, or a given suggestion', () => {
    using editor = buildEditor();
    const output = typeahead(editor);
    type(editor, ':+1');
    press(editor, KEY_TAB_COMMAND, 'Tab');
    expect(describeText(editor)).toEqual([{emoji: '👍'}, ' ']);
    type(editor, ':smile');
    output.select(1);
    expect(describeText(editor)).toEqual([
      {emoji: '👍'},
      ' ',
      {emoji: '😃'},
      ' ',
    ]);
  });

  it('leaves the keys alone while closed', () => {
    using editor = buildEditor();
    type(editor, 'hi');
    expect(press(editor, KEY_ENTER_COMMAND, 'Enter').handled).toBe(false);
    expect(press(editor, KEY_ARROW_DOWN_COMMAND, 'ArrowDown').handled).toBe(
      false,
    );
  });

  it('closes on Escape until something else is typed', () => {
    using editor = buildEditor();
    const {state} = typeahead(editor);
    type(editor, ':app');
    expect(press(editor, KEY_ESCAPE_COMMAND, 'Escape').handled).toBe(true);
    expect(state.value).toBe(null);
    expect(press(editor, KEY_ENTER_COMMAND, 'Enter').handled).toBe(false);
    type(editor, 'l');
    expect(state.value?.query).toBe('appl');
  });

  it('suggests custom emoji, including ones looked up while it is open', async () => {
    let resolveLookup: (found: readonly CustomEmoji[]) => void = () => {};
    using editor = buildEditor({
      lookupCustomEmoji: () =>
        new Promise(resolve => {
          resolveLookup = resolve;
        }),
    });
    const {state} = typeahead(editor);
    type(editor, ':partyp');
    expect(state.value).toBe(null);
    resolveLookup([PARROT]);
    await Promise.resolve();
    expect(state.value?.suggestions).toEqual([
      {custom: PARROT, name: 'partyparrot', src: 'parrot.gif'},
    ]);
    press(editor, KEY_ENTER_COMMAND, 'Enter');
    expect(describeText(editor)).toEqual([{custom: 'partyparrot'}, ' ']);
  });

  it('stays closed while read-only, and once disposed', () => {
    const editor = buildEditor();
    const {state} = typeahead(editor);
    type(editor, ':app');
    editor.setEditable(false);
    expect(state.value).toBe(null);
    editor.setEditable(true);
    expect(state.value?.query).toBe('app');
    editor.dispose();
    expect(state.value).toBe(null);
  });
});

describe('INSERT_EMOJI_COMMAND', () => {
  beforeAll(async () => {
    await loadEmojiDatabase();
  });

  it('inserts what searchEmoji found at the caret', () => {
    using editor = buildEditor({customEmoji: [PARROT]});
    const {searchEmoji} = getExtensionDependencyFromEditor(
      editor,
      EmojiExtension,
    ).output;
    const search = searchEmoji.value;
    expect(search).not.toBe(null);
    const [apple] = search?.('apple') ?? [];
    const [parrot] = search?.('partyparrot') ?? [];
    type(editor, 'a');
    editor.dispatchCommand(INSERT_EMOJI_COMMAND, apple);
    editor.dispatchCommand(INSERT_EMOJI_COMMAND, parrot);
    type(editor, 'b');
    expect(describeText(editor)).toEqual([
      'a',
      {emoji: '🍎'},
      {custom: 'partyparrot'},
      'b',
    ]);
    editor.read(() => {
      const last = $getRoot().getLastDescendant();
      expect($isTextNode(last) && last.getTextContent()).toBe('b');
    });
  });
});
