import {
  buildEditorFromExtensions,
  getExtensionDependencyFromEditor,
} from '@lexical/extension';
import {$generateHtmlFromNodes, DOMImportExtension} from '@lexical/html';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $selectAll,
  configExtension,
  defineExtension,
  IS_BOLD,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  type LexicalEditor,
  TextNode,
} from 'lexical';
import {beforeAll, describe, expect, it, vi} from 'vitest';

import {
  $createCustomEmojiNode,
  $createEmojiNode,
  $isCustomEmojiNode,
  $isEmojiNode,
  type CustomEmoji,
  EmojiExtension,
  type EmojiExtensionConfig,
  parseEmojiShortNames,
} from '../../index.ts';
import {loadEmojiDatabase} from '../../loadEmojiDatabase.ts';

function buildEditor(config: Partial<EmojiExtensionConfig> = {}) {
  return buildEditorFromExtensions(
    defineExtension({
      dependencies: [configExtension(EmojiExtension, config)],
      name: '[root]',
    }),
  );
}

const PARROT: CustomEmoji = {
  name: 'partyparrot',
  src: 'https://example.com/parrot.gif',
};

function $getTextNodes(): TextNode[] {
  return $getRoot().getAllTextNodes();
}

function setText(editor: LexicalEditor, text: string, format = 0) {
  editor.update(
    () => {
      $getRoot()
        .clear()
        .append(
          $createParagraphNode().append(
            $createTextNode(text).setFormat(format),
          ),
        );
    },
    {discrete: true},
  );
}

// The inline nodes of every paragraph
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

function getCustomEmoji(editor: LexicalEditor) {
  return getExtensionDependencyFromEditor(editor, EmojiExtension).output
    .customEmoji;
}

describe('EmojiExtension', () => {
  // In a browser the emoji database loads as a separate chunk
  beforeAll(async () => {
    await loadEmojiDatabase();
  });

  it('replaces shortcodes and texts with emoji', () => {
    using editor = buildEditor();
    setText(editor, 'hi :smile: there :) ok');
    expect(describeText(editor)).toEqual([
      'hi ',
      {emoji: '😄', shortcode: ':smile:'},
      ' there ',
      {emoji: '🙂', shortcode: ':)'},
      ' ok',
    ]);
  });

  it('keeps the text format of the shortcode', () => {
    using editor = buildEditor();
    setText(editor, ':smile:', IS_BOLD);
    editor.read(() => {
      const [node] = $getTextNodes();
      expect($isEmojiNode(node) && node.hasFormat('bold')).toBe(true);
    });
  });

  it('leaves code alone', () => {
    using editor = buildEditor();
    editor.update(
      () => {
        $getRoot().append(
          $createParagraphNode().append(
            $createTextNode('a :smile: b').toggleFormat('code'),
          ),
        );
      },
      {discrete: true},
    );
    expect(describeText(editor)).toEqual(['a :smile: b']);
  });

  it('turns typed and pasted Unicode emoji into emoji nodes', () => {
    using editor = buildEditor();
    setText(editor, 'a 👍🏼b:smile:🇯🇵 © ☺️');
    expect(describeText(editor)).toEqual([
      'a ',
      {emoji: '👍🏼', shortcode: ':+1::skin-tone-3:'},
      'b',
      {emoji: '😄', shortcode: ':smile:'},
      {emoji: '🇯🇵', shortcode: ':jp:'},
      // A symbol drawn as text by default stays text
      ' © ',
      {emoji: '☺️', shortcode: ':relaxed:'},
    ]);
  });

  it('leaves Unicode emoji as text without convertUnicodeEmoji', () => {
    using editor = buildEditor({convertUnicodeEmoji: false});
    setText(editor, 'a 👍 :+1:');
    expect(describeText(editor)).toEqual([
      'a 👍 ',
      {emoji: '👍', shortcode: ':+1:'},
    ]);
    // Turning it on converts the ones already there
    getExtensionDependencyFromEditor(
      editor,
      EmojiExtension,
    ).output.convertUnicodeEmoji.value = true;
    editor.update(() => {}, {discrete: true});
    expect(describeText(editor)).toEqual([
      'a ',
      {emoji: '👍', shortcode: ':+1:'},
      ' ',
      {emoji: '👍', shortcode: ':+1:'},
    ]);
  });

  it('uses parseEmojiReplacementEntry', () => {
    using editor = buildEditor({
      parseEmojiReplacementEntry: parseEmojiShortNames,
    });
    setText(editor, ':smile: :) ok');
    expect(describeText(editor)).toEqual([
      {emoji: '😄', shortcode: ':smile:'},
      ' :) ok',
    ]);
  });

  it('does not convert shortcodes while read-only', () => {
    using editor = buildEditor();
    editor.setEditable(false);
    setText(editor, 'a :smile: b');
    expect(describeText(editor)).toEqual(['a :smile: b']);
    // Catches up when the editor becomes editable
    editor.setEditable(true);
    editor.update(() => {}, {discrete: true});
    expect(describeText(editor)).toEqual([
      'a ',
      {emoji: '😄', shortcode: ':smile:'},
      ' b',
    ]);
  });

  it('shows the image for the emoji', () => {
    using editor = buildEditor({
      emojiBaseUrl: 'https://example.com/emoji',
      emojiClass: 'emoji',
    });
    const root = document.createElement('div');
    editor.setRootElement(root);
    setText(editor, 'a :smile: b');
    const span = root.querySelector<HTMLElement>('[data-emoji-shortcode]');
    expect(span?.className).toBe('emoji');
    expect(span?.textContent).toBe('😄');
    expect(span?.dataset.emojiShortcode).toBe(':smile:');
    expect(span?.style.backgroundImage).toBe(
      'url("https://example.com/emoji/1f604.png")',
    );
    // Sized and aligned like a custom emoji, whatever the font
    expect(span?.style).toMatchObject({
      height: '1.25em',
      margin: '0px 0.075em',
      overflow: 'hidden',
      verticalAlign: '-0.25em',
      width: '1.25em',
    });
    editor.setRootElement(null);
  });

  it('keeps its shortcode when cloned by a later update', () => {
    using editor = buildEditor();
    setText(editor, ':smile:');
    editor.update(
      () => {
        const [node] = $getTextNodes();
        node.setStyle('color: red');
      },
      {discrete: true},
    );
    editor.read(() => {
      const [node] = $getTextNodes();
      expect($isEmojiNode(node) && node.getShortcode()).toBe(':smile:');
      expect(node.getStyle()).toBe('color: red');
    });
  });

  it('has a prefixed type, so an app can keep its own emoji node', () => {
    class InHouseEmojiNode extends TextNode {
      $config() {
        return this.config('emoji', {extends: TextNode});
      }
    }
    using editor = buildEditorFromExtensions(
      defineExtension({
        dependencies: [EmojiExtension],
        name: '[root]',
        nodes: () => [InHouseEmojiNode],
      }),
    );
    setText(editor, ':smile:');
    expect(describeText(editor)).toEqual([{emoji: '😄', shortcode: ':smile:'}]);
  });

  it('serializes the shortcode as a top-level property', () => {
    using editor = buildEditor();
    setText(editor, ':smile:');
    const json = editor.getEditorState().toJSON();
    const paragraph = json.root.children[0] as unknown as {
      children: Record<string, unknown>[];
    };
    expect(paragraph.children[0]).toMatchObject({
      mode: 'token',
      shortcode: ':smile:',
      text: '😄',
      type: 'mn:emoji',
    });

    using other = buildEditor();
    other.setEditorState(other.parseEditorState(json));
    expect(describeText(other)).toEqual([{emoji: '😄', shortcode: ':smile:'}]);
  });

  it('round trips through HTML', () => {
    using editor = buildEditor();
    editor.update(
      () => {
        $getRoot()
          .clear()
          .append(
            $createParagraphNode().append(
              $createTextNode('a '),
              $createEmojiNode('🙂', ':)').toggleFormat('bold'),
            ),
          );
      },
      {discrete: true},
    );
    const html = editor.read(() => $generateHtmlFromNodes(editor));
    expect(html).toContain('data-emoji-shortcode=":)"');

    using other = buildEditor();
    const {$generateNodesFromDOM} = getExtensionDependencyFromEditor(
      other,
      DOMImportExtension,
    ).output;
    other.update(
      () => {
        const dom = new DOMParser().parseFromString(html, 'text/html');
        $getRoot()
          .clear()
          .append(...$generateNodesFromDOM(dom));
      },
      {discrete: true},
    );
    other.read(() => {
      const emoji = $getTextNodes().find($isEmojiNode);
      expect(emoji?.getTextContent()).toBe('🙂');
      expect(emoji?.getShortcode()).toBe(':)');
      expect(emoji?.hasFormat('bold')).toBe(true);
      expect(emoji?.isToken()).toBe(true);
      expect($getTextNodes().filter($isTextNode)).toHaveLength(2);
    });
  });

  describe('custom emoji', () => {
    describe('lookupCustomEmoji', () => {
      const SERVER: readonly CustomEmoji[] = [
        PARROT,
        {name: 'party', src: 'party.png'},
        {name: 'mochi', src: 'mochi.png'},
      ];

      function buildLookupEditor(onError: (error: Error) => void = vi.fn()) {
        const queries: string[] = [];
        const pending: Promise<unknown>[] = [];
        const lookup = vi.fn((query: string, _signal: AbortSignal) => {
          queries.push(query);
          const result = Promise.resolve(
            SERVER.filter(emoji => emoji.name.startsWith(query)),
          );
          pending.push(result);
          return result;
        });
        const editor = buildEditorFromExtensions(
          defineExtension({
            dependencies: [
              configExtension(EmojiExtension, {lookupCustomEmoji: lookup}),
            ],
            name: '[root]',
            onError,
          }),
        );
        const settle = async () => {
          await Promise.all(pending);
          editor.update(() => {}, {discrete: true});
        };
        return {editor, lookup, queries, settle};
      }

      // Types `text` one character at a time at the end of the paragraph
      function type(editor: LexicalEditor, text: string) {
        for (const char of text) {
          editor.update(
            () => {
              const last = $getRoot().getLastDescendant();
              if ($isTextNode(last)) {
                last.selectEnd();
              } else {
                $getRoot().selectEnd();
              }
              const selection = $getSelection();
              if ($isRangeSelection(selection)) {
                selection.insertText(char);
              }
            },
            {discrete: true},
          );
        }
      }

      it('looks up a name as it is typed, from two characters', async () => {
        const {editor, queries, settle} = buildLookupEditor();
        using _editor = editor;
        setText(editor, 'so ');
        type(editor, ':p');
        expect(queries).toEqual([]);
        type(editor, 'ar');
        expect(queries).toEqual(['pa', 'par']);
        await settle();
        // By the closing colon the emoji is already known
        expect(getCustomEmoji(editor).value).toEqual([
          PARROT,
          {name: 'party', src: 'party.png'},
        ]);
        type(editor, 'typarrot:');
        expect(describeText(editor)).toEqual(['so ', {custom: 'partyparrot'}]);
      });

      it('asks each query once', async () => {
        const {editor, queries, settle} = buildLookupEditor();
        using _editor = editor;
        setText(editor, '');
        type(editor, ':zz');
        await settle();
        setText(editor, '');
        type(editor, ':zz');
        expect(queries).toEqual(['zz']);
      });

      it('looks up unknown names in the document', async () => {
        const {editor, queries, settle} = buildLookupEditor();
        using _editor = editor;
        const json = JSON.stringify({
          root: {
            children: [
              {
                children: [
                  {name: 'mochi', text: ':mochi:', type: 'mn:emoji'},
                  {text: ' and :partyparrot: ', type: 'text'},
                ],
                type: 'paragraph',
              },
            ],
            type: 'root',
          },
        });
        editor.setEditorState(editor.parseEditorState(json));
        editor.update(() => {}, {discrete: true});
        expect([...queries].sort()).toEqual(['mochi', 'partyparrot']);
        await settle();
        expect(describeText(editor)).toEqual([
          {custom: 'mochi'},
          ' and ',
          {custom: 'partyparrot'},
          ' ',
        ]);
      });

      it('does not look up names it knows, or while read-only', async () => {
        const {editor, queries} = buildLookupEditor();
        using _editor = editor;
        getCustomEmoji(editor).value = [PARROT];
        setText(editor, 'a :partyparrot: b');
        expect(queries).toEqual([]);
        editor.setEditable(false);
        setText(editor, ':mo');
        expect(queries).toEqual([]);
      });

      it('ignores results after dispose and reports failures', async () => {
        const onError = vi.fn();
        const failing = buildEditorFromExtensions(
          defineExtension({
            dependencies: [
              configExtension(EmojiExtension, {
                lookupCustomEmoji: () => Promise.reject(new Error('offline')),
              }),
            ],
            name: '[root]',
            onError,
          }),
        );
        using _failing = failing;
        setText(failing, 'a :nope: b');
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(onError).toHaveBeenCalledWith(new Error('offline'), failing);

        const {editor, lookup, settle} = buildLookupEditor();
        setText(editor, ':partyparrot: ');
        const [, signal] = lookup.mock.calls[0];
        editor.dispose();
        expect(signal.aborted).toBe(true);
        await settle().catch(() => {});
        expect(getCustomEmoji(editor).value).toEqual([]);
      });
    });

    describe('loadCustomEmoji', () => {
      function buildLoadingEditor(
        load: Promise<readonly CustomEmoji[]>,
        onError: (error: Error) => void = vi.fn(),
      ) {
        let loadSignal: AbortSignal | undefined;
        const editor = buildEditorFromExtensions(
          defineExtension({
            dependencies: [
              configExtension(EmojiExtension, {
                customEmoji: [{name: 'mochi', src: 'mochi.png'}],
                loadCustomEmoji: signal => {
                  loadSignal = signal;
                  return load;
                },
              }),
            ],
            name: '[root]',
            onError,
          }),
        );
        return {editor, getSignal: () => loadSignal};
      }

      it('adds what it loads, converting text typed meanwhile', async () => {
        const load = Promise.withResolvers<readonly CustomEmoji[]>();
        const {editor} = buildLoadingEditor(load.promise);
        using _editor = editor;
        setText(editor, 'so :partyparrot:');
        expect(describeText(editor)).toEqual(['so :partyparrot:']);
        load.resolve([PARROT, {name: 'mochi', src: 'loaded.png'}]);
        await load.promise;
        editor.update(() => {}, {discrete: true});
        expect(describeText(editor)).toEqual(['so ', {custom: 'partyparrot'}]);
        // Loaded emoji replace configured ones with the same name
        expect(getCustomEmoji(editor).value).toEqual([
          PARROT,
          {name: 'mochi', src: 'loaded.png'},
        ]);
      });

      it('is aborted and ignored when the editor is disposed', async () => {
        const load = Promise.withResolvers<readonly CustomEmoji[]>();
        const onError = vi.fn();
        const {editor, getSignal} = buildLoadingEditor(load.promise, onError);
        const output = getCustomEmoji(editor);
        expect(getSignal()?.aborted).toBe(false);
        editor.dispose();
        expect(getSignal()?.aborted).toBe(true);
        load.reject(new DOMException('Aborted', 'AbortError'));
        await load.promise.catch(() => {});
        expect(onError).not.toHaveBeenCalled();
        expect(output.value).toEqual([{name: 'mochi', src: 'mochi.png'}]);
      });

      it("reports a failure to the editor's onError", async () => {
        const load = Promise.withResolvers<readonly CustomEmoji[]>();
        const onError = vi.fn();
        const {editor} = buildLoadingEditor(load.promise, onError);
        using _editor = editor;
        const error = new Error('offline');
        load.reject(error);
        await load.promise.catch(() => {});
        expect(onError).toHaveBeenCalledWith(error, editor);
      });
    });

    it('replaces :name: with a custom emoji', () => {
      using editor = buildEditor({customEmoji: [PARROT]});
      setText(editor, 'so :partyparrot: wow');
      expect(describeText(editor)).toEqual([
        'so ',
        {custom: 'partyparrot'},
        ' wow',
      ]);
      expect(editor.read(() => $getRoot().getTextContent())).toBe(
        'so :partyparrot: wow',
      );
    });

    it('keeps the caret after the emoji while typing', () => {
      using editor = buildEditor({customEmoji: [PARROT]});
      editor.update(
        () => {
          const text = $createTextNode('so :partyparrot:');
          $getRoot().clear().append($createParagraphNode().append(text));
          text.selectEnd();
        },
        {discrete: true},
      );
      editor.update(
        () => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            selection.insertText('!');
          }
        },
        {discrete: true},
      );
      expect(describeText(editor)).toEqual([
        'so ',
        {custom: 'partyparrot'},
        '!',
      ]);
    });

    it('is one caret position for the arrow keys', () => {
      using editor = buildEditor({customEmoji: [PARROT]});
      setText(editor, 'ab :partyparrot: cd');
      const caret = () =>
        editor.read(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) {
            return null;
          }
          const point = (p: typeof selection.anchor) =>
            `${p.getNode().getTextContent()}@${p.offset}`;
          return `${point(selection.anchor)}-${point(selection.focus)}`;
        });
      const press = (
        command: typeof KEY_ARROW_LEFT_COMMAND,
        key: string,
        shiftKey = false,
      ) =>
        editor.update(
          () => {
            editor.dispatchCommand(
              command,
              new KeyboardEvent('keydown', {key, shiftKey}),
            );
          },
          {discrete: true},
        );
      editor.update(
        () => {
          $getTextNodes()[0].select(3, 3);
        },
        {discrete: true},
      );
      expect(caret()).toBe('ab @3-ab @3');
      press(KEY_ARROW_RIGHT_COMMAND, 'ArrowRight');
      expect(caret()).toBe(' cd@0- cd@0');
      press(KEY_ARROW_LEFT_COMMAND, 'ArrowLeft');
      expect(caret()).toBe('ab @3-ab @3');
      press(KEY_ARROW_RIGHT_COMMAND, 'ArrowRight', true);
      expect(caret()).toBe('ab @3- cd@0');
      expect(editor.read(() => $getSelection()?.getTextContent())).toBe(
        ':partyparrot:',
      );
    });

    it('can be changed while the editor runs', () => {
      using editor = buildEditor();
      const root = document.createElement('div');
      editor.setRootElement(root);
      setText(editor, 'so :partyparrot:');
      expect(describeText(editor)).toEqual(['so :partyparrot:']);

      // Text already typed turns into the new emoji
      getCustomEmoji(editor).value = [PARROT];
      editor.update(() => {}, {discrete: true});
      expect(describeText(editor)).toEqual(['so ', {custom: 'partyparrot'}]);
      const span = root.querySelector<HTMLElement>('[data-custom-emoji]');
      expect(span?.className).toBe('mochinori-custom-emoji');
      // The text is still there, at zero size, over the image
      const text = span?.firstElementChild as HTMLElement;
      expect(text.textContent).toBe(':partyparrot:');
      expect(text.style.fontSize).toBe('0px');
      expect(span?.getAttribute('role')).toBe('img');
      expect(span?.getAttribute('aria-label')).toBe(':partyparrot:');
      expect(span?.style.backgroundImage).toContain(PARROT.src);
      expect(span?.style).toMatchObject({
        height: '1.25em',
        margin: '0px 0.075em',
        overflow: 'hidden',
        verticalAlign: '-0.25em',
      });

      // A new image for the name
      getCustomEmoji(editor).value = [{...PARROT, src: 'new.gif'}];
      expect(span?.style.backgroundImage).toContain('new.gif');

      // Removed: the node stays, and shows its name
      getCustomEmoji(editor).value = [];
      expect(span?.style.backgroundImage).toBe('');
      expect(span?.hasAttribute('role')).toBe(false);
      expect(text.style.fontSize).toBe('');
      expect(span?.textContent).toBe(':partyparrot:');
      expect(describeText(editor)).toEqual(['so ', {custom: 'partyparrot'}]);
      editor.setRootElement(null);
    });

    it('serializes as text with its name', () => {
      using editor = buildEditor({customEmoji: [PARROT]});
      setText(editor, ':partyparrot:');
      const json = editor.getEditorState().toJSON(true);
      const paragraph = json.root.children![0] as unknown as {
        children: Record<string, unknown>[];
      };
      expect(paragraph.children[0]).toEqual({
        mode: 'token',
        name: 'partyparrot',
        text: ':partyparrot:',
        type: 'mn:emoji',
      });
      using other = buildEditor();
      other.setEditorState(other.parseEditorState(json));
      expect(describeText(other)).toEqual([{custom: 'partyparrot'}]);
    });

    it('keeps text formatting', () => {
      using editor = buildEditor({customEmoji: [PARROT]});
      setText(editor, ':partyparrot:', IS_BOLD);
      const root = document.createElement('div');
      editor.setRootElement(root);
      editor.read(() => {
        const [node] = $getTextNodes();
        expect($isCustomEmojiNode(node) && node.hasFormat('bold')).toBe(true);
      });
      const el = root.querySelector<HTMLElement>('[data-custom-emoji]');
      expect(el?.tagName).toBe('STRONG');
      expect(el?.style.backgroundImage).toContain(PARROT.src);
      editor.setRootElement(null);
    });

    it('round trips through HTML by name', () => {
      using editor = buildEditor({customEmoji: [PARROT]});
      editor.update(
        () => {
          $getRoot()
            .clear()
            .append(
              $createParagraphNode().append(
                $createTextNode('a '),
                $createCustomEmojiNode('partyparrot'),
              ),
            );
        },
        {discrete: true},
      );
      const html = editor.read(() => $generateHtmlFromNodes(editor));
      expect(html).toContain('data-custom-emoji="partyparrot"');
      expect(html).toContain(`src="${PARROT.src}"`);

      using other = buildEditor({
        customEmoji: [{...PARROT, src: 'mine.gif'}],
      });
      const {$generateNodesFromDOM} = getExtensionDependencyFromEditor(
        other,
        DOMImportExtension,
      ).output;
      other.update(
        () => {
          const dom = new DOMParser().parseFromString(html, 'text/html');
          $getRoot()
            .clear()
            .append(...$generateNodesFromDOM(dom));
        },
        {discrete: true},
      );
      expect(describeText(other)).toEqual(['a ', {custom: 'partyparrot'}]);
    });

    it('copies as :name: in plain text', () => {
      using editor = buildEditor({customEmoji: [PARROT]});
      setText(editor, 'a :partyparrot: b');
      editor.update(
        () => {
          $selectAll();
          expect($getSelection()?.getTextContent()).toBe('a :partyparrot: b');
        },
        {discrete: true},
      );
    });
  });
});
