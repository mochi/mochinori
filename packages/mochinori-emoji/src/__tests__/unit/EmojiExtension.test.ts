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
  type LexicalEditor,
  TextNode,
} from 'lexical';
import {beforeAll, describe, expect, it} from 'vitest';

import {
  $createCustomEmojiNode,
  $createEmojiNode,
  $isCustomEmojiNode,
  $isEmojiNode,
  type CustomEmoji,
  EmojiExtension,
  type EmojiExtensionConfig,
  EmojiImportExtension,
  parseEmojiShortNames,
} from '../../index.ts';
import {loadTextNodeTransform} from '../../loadTextNodeTransform.ts';

function buildEditor(config: Partial<EmojiExtensionConfig> = {}) {
  return buildEditorFromExtensions(
    defineExtension({
      dependencies: [
        configExtension(EmojiExtension, config),
        EmojiImportExtension,
      ],
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
        $isEmojiNode(node)
          ? {emoji: node.getTextContent(), shortcode: node.getShortcode()}
          : $isCustomEmojiNode(node)
            ? {custom: node.getName()}
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
    await loadTextNodeTransform();
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
      expect(span?.contentEditable).toBe('false');
      expect(span?.querySelector('img')?.getAttribute('src')).toBe(PARROT.src);

      // A new image for the name
      getCustomEmoji(editor).value = [{...PARROT, src: 'new.gif'}];
      expect(span?.querySelector('img')?.getAttribute('src')).toBe('new.gif');

      // Removed: the node stays, and shows its name
      getCustomEmoji(editor).value = [];
      expect(span?.querySelector('img')).toBe(null);
      expect(span?.textContent).toBe(':partyparrot:');
      expect(describeText(editor)).toEqual(['so ', {custom: 'partyparrot'}]);
      editor.setRootElement(null);
    });

    it('serializes only the name', () => {
      using editor = buildEditor({customEmoji: [PARROT]});
      setText(editor, ':partyparrot:');
      const json = editor.getEditorState().toJSON();
      const paragraph = json.root.children[0] as unknown as {
        children: Record<string, unknown>[];
      };
      expect(paragraph.children[0]).toEqual({
        name: 'partyparrot',
        type: 'mn:custom-emoji',
        version: 1,
      });
      using other = buildEditor();
      other.setEditorState(other.parseEditorState(json));
      expect(describeText(other)).toEqual([{custom: 'partyparrot'}]);
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
