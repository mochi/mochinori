import {
  buildEditorFromExtensions,
  getExtensionDependencyFromEditor,
} from '@lexical/extension';
import {$generateHtmlFromNodes, DOMImportExtension} from '@lexical/html';
import {RichTextExtension} from '@lexical/rich-text';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $insertNodes,
  $isElementNode,
  $isNodeSelection,
  $isRangeSelection,
  $isTextNode,
  CLICK_COMMAND,
  defineExtension,
  type ElementNode,
  KEY_BACKSPACE_COMMAND,
  KEY_ESCAPE_COMMAND,
  type LexicalEditor,
} from 'lexical';
import {describe, expect, it} from 'vitest';

import {$moveImageToPoint} from '../../ImageInteractions.ts';
import {
  $createImageNode,
  $isImageNode,
  type ImageNode,
  ImagesImportExtension,
} from '../../index.ts';

function buildEditor() {
  const editor = buildEditorFromExtensions(
    defineExtension({
      $initialEditorState: () => {
        $getRoot().append(
          $createParagraphNode().append($createTextNode('one ')),
          $createParagraphNode().append($createTextNode('two')),
        );
      },
      dependencies: [RichTextExtension, ImagesImportExtension],
      name: '[root]',
    }),
  );
  const root = document.createElement('div');
  root.contentEditable = 'true';
  document.body.append(root);
  editor.setRootElement(root);
  return editor;
}

function update(editor: LexicalEditor, fn: () => void) {
  editor.update(fn, {discrete: true});
}

function $images(): ImageNode[] {
  return $getRoot()
    .getChildren()
    .flatMap(child =>
      $isElementNode(child) ? child.getChildren().filter($isImageNode) : [],
    );
}

function $paragraph(index: number): ElementNode {
  const node = $getRoot().getChildAtIndex(index);
  if (!$isElementNode(node)) {
    throw new Error(`no paragraph ${index}`);
  }
  return node;
}

/** Inserts a captioned image at the end of the first paragraph */
function insertImage(editor: LexicalEditor, caption?: string) {
  update(editor, () => {
    $paragraph(0).selectEnd();
    $insertNodes([$createImageNode({caption, src: 'a.png'})]);
  });
}

function keyEvent(key: string) {
  return new KeyboardEvent('keydown', {cancelable: true, key});
}

describe('image captions', () => {
  it('keeps the caption in a named slot, not a nested editor', () => {
    using editor = buildEditor();
    insertImage(editor, 'A mochi');
    editor.read(() => {
      const [image] = $images();
      expect(image.hasCaption()).toBe(true);
      expect(image.getCaption()?.getTextContent()).toBe('A mochi');
      // Slot text is part of the document's text
      expect($paragraph(0).getTextContent()).toContain('A mochi');
    });
    const json = editor.getEditorState().toJSON();
    const [paragraph] = json.root.children as unknown as [
      {children: Record<string, unknown>[]},
    ];
    expect(paragraph.children[1]).toMatchObject({
      $slots: {
        caption: {
          children: [expect.objectContaining({text: 'A mochi'})],
          type: 'paragraph',
        },
      },
      src: 'a.png',
      type: 'image',
    });

    using other = buildEditor();
    other.setEditorState(other.parseEditorState(json));
    other.read(() => {
      expect($images()[0].getCaption()?.getTextContent()).toBe('A mochi');
    });
  });

  it('keeps the caption when a later update clones the image', () => {
    using editor = buildEditor();
    insertImage(editor, 'A mochi');
    update(editor, () => {
      $images()[0].setAltText('mochi');
    });
    editor.read(() => {
      expect($images()[0].getCaption()?.getTextContent()).toBe('A mochi');
    });
  });

  it('adds, keeps and removes a caption with setCaption', () => {
    using editor = buildEditor();
    insertImage(editor);
    update(editor, () => {
      const [image] = $images();
      expect(image.hasCaption()).toBe(false);
      image.setCaption();
      const caption = image.getCaption();
      expect(caption).not.toBe(null);
      image.setCaption();
      expect(image.getCaption()?.is(caption)).toBe(true);
      image.setCaption(null);
      expect(image.hasCaption()).toBe(false);
    });
  });

  it('exports a captioned image as a figure and imports it back', () => {
    using editor = buildEditor();
    insertImage(editor, 'A mochi');
    const html = editor.read(() => $generateHtmlFromNodes(editor));
    expect(html).toContain(
      '<figure><img src="a.png" alt=""><figcaption><span style="white-space: pre-wrap;">A mochi</span></figcaption></figure>',
    );

    using other = buildEditor();
    const {$generateNodesFromDOM} = getExtensionDependencyFromEditor(
      other,
      DOMImportExtension,
    ).output;
    update(other, () => {
      const dom = new DOMParser().parseFromString(
        '<figure><img src="b.png" alt="b"><figcaption><p>From <b>Wikipedia</b></p></figcaption></figure>',
        'text/html',
      );
      $getRoot().clear().select();
      $insertNodes($generateNodesFromDOM(dom));
    });
    other.read(() => {
      const [image] = $images();
      expect(image.getSrc()).toBe('b.png');
      expect(image.getCaption()?.getTextContent()).toBe('From Wikipedia');
    });
  });

  it('Escape in the caption selects the image', () => {
    using editor = buildEditor();
    insertImage(editor, 'A mochi');
    update(editor, () => {
      const caption = $images()[0].getCaption() as ElementNode;
      caption.selectEnd();
    });
    update(editor, () => {
      expect(
        editor.dispatchCommand(KEY_ESCAPE_COMMAND, keyEvent('Escape')),
      ).toBe(true);
    });
    editor.read(() => {
      const selection = $getSelection();
      expect($isNodeSelection(selection)).toBe(true);
      expect(selection?.getNodes()[0].is($images()[0])).toBe(true);
    });
  });

  it('Backspace removes an empty caption, but not one with text', () => {
    using editor = buildEditor();
    insertImage(editor, 'x');
    update(editor, () => {
      ($images()[0].getCaption() as ElementNode).selectEnd();
      // Rich text deletes the character; the caption stays
      editor.dispatchCommand(KEY_BACKSPACE_COMMAND, keyEvent('Backspace'));
      expect($images()[0].hasCaption()).toBe(true);
      ($images()[0].getCaption() as ElementNode).clear().selectEnd();
    });
    update(editor, () => {
      expect(
        editor.dispatchCommand(KEY_BACKSPACE_COMMAND, keyEvent('Backspace')),
      ).toBe(true);
    });
    editor.read(() => {
      expect($images()[0].hasCaption()).toBe(false);
      expect($isNodeSelection($getSelection())).toBe(true);
    });
  });
});

describe('image selection', () => {
  it('selects an image when it is clicked, but not its caption', () => {
    using editor = buildEditor();
    insertImage(editor, 'A mochi');
    const key = editor.read(() => $images()[0].getKey());
    const dom = editor.getElementByKey(key)!;
    update(editor, () => {
      $paragraph(1).selectEnd();
      const event = new MouseEvent('click');
      Object.defineProperty(event, 'target', {value: dom});
      expect(editor.dispatchCommand(CLICK_COMMAND, event)).toBe(true);
    });
    editor.read(() => {
      const selection = $getSelection();
      expect($isNodeSelection(selection)).toBe(true);
      expect(selection?.getNodes().map(node => node.getKey())).toEqual([key]);
    });

    const slot = dom.querySelector('[data-lexical-slot]')!;
    expect(slot).not.toBe(null);
    update(editor, () => {
      const event = new MouseEvent('click');
      Object.defineProperty(event, 'target', {value: slot});
      expect(editor.dispatchCommand(CLICK_COMMAND, event)).toBe(false);
    });
  });
});

describe('read-only editors', () => {
  it('does not select images or handle caption keys until editable', () => {
    using editor = buildEditor();
    insertImage(editor, 'A mochi');
    update(editor, () => {
      ($images()[0].getCaption() as ElementNode).selectEnd();
    });
    editor.setEditable(false);
    const dom = editor.read(() =>
      editor.getElementByKey($images()[0].getKey()),
    )!;
    update(editor, () => {
      const event = new MouseEvent('click');
      Object.defineProperty(event, 'target', {value: dom});
      editor.dispatchCommand(CLICK_COMMAND, event);
      editor.dispatchCommand(KEY_ESCAPE_COMMAND, keyEvent('Escape'));
      expect($isNodeSelection($getSelection())).toBe(false);
    });
    // The interactions come back when the editor becomes editable
    editor.setEditable(true);
    update(editor, () => {
      editor.dispatchCommand(KEY_ESCAPE_COMMAND, keyEvent('Escape'));
      expect($isNodeSelection($getSelection())).toBe(true);
    });
  });
});

describe('moving images', () => {
  function textDOM(editor: LexicalEditor, index: number): Text {
    const key = editor.read(() => {
      const text = $paragraph(index).getFirstChild();
      if (!$isTextNode(text)) {
        throw new Error('no text');
      }
      return text.getKey();
    });
    return editor.getElementByKey(key)!.firstChild as Text;
  }

  it('moves an image, with its caption, to another paragraph', () => {
    using editor = buildEditor();
    insertImage(editor, 'A mochi');
    const point = {node: textDOM(editor, 1), offset: 1};
    update(editor, () => {
      expect($moveImageToPoint($images()[0], point)).toBe(true);
    });
    editor.read(() => {
      expect($paragraph(0).getTextContent()).toBe('one ');
      const children = $paragraph(1).getChildren();
      expect(children.map(child => child.getType())).toEqual([
        'text',
        'image',
        'text',
      ]);
      const image = children[1] as ImageNode;
      expect(image.getCaption()?.getTextContent()).toBe('A mochi');
      const selection = $getSelection();
      expect(selection?.getNodes()[0].is(image)).toBe(true);
    });
  });

  it('moves an image within its own paragraph', () => {
    using editor = buildEditor();
    insertImage(editor);
    const point = {node: textDOM(editor, 0), offset: 2};
    update(editor, () => {
      expect($moveImageToPoint($images()[0], point)).toBe(true);
    });
    editor.read(() => {
      const children = $paragraph(0).getChildren();
      expect(children.map(child => child.getTextContent())).toEqual([
        'on',
        '',
        'e ',
      ]);
      expect($isImageNode(children[1])).toBe(true);
    });
  });

  it('does not move an image into a caption', () => {
    using editor = buildEditor();
    insertImage(editor, 'A mochi');
    const captionText = editor.read(() => {
      const caption = $images()[0].getCaption() as ElementNode;
      return caption.getFirstChildOrThrow().getKey();
    });
    update(editor, () => {
      $paragraph(1).selectEnd();
      $insertNodes([$createImageNode({src: 'b.png'})]);
    });
    const point = {
      node: editor.getElementByKey(captionText)!.firstChild!,
      offset: 1,
    };
    update(editor, () => {
      const moving = $images()[1];
      expect($moveImageToPoint(moving, point)).toBe(false);
      const selection = $getSelection();
      expect($isRangeSelection(selection)).toBe(true);
    });
  });
});
