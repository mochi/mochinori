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
  $isParagraphNode,
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
  ImagesExtension,
  INSERT_IMAGE_COMMAND,
  SET_IMAGE_ALT_TEXT_COMMAND,
  SET_IMAGE_BLOCK_COMMAND,
  SET_IMAGE_CAPTION_COMMAND,
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
      dependencies: [RichTextExtension, ImagesExtension],
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

/** Block images in the root and inline images in paragraphs, in order */
function $images(): ImageNode[] {
  return $getRoot()
    .getChildren()
    .flatMap(child =>
      $isImageNode(child)
        ? [child]
        : $isElementNode(child)
          ? child.getChildren().filter($isImageNode)
          : [],
    );
}

/** The first block image */
function $figure(): ImageNode {
  const figure = $images().find(image => image.isBlock());
  if (!figure) {
    throw new Error('no block image');
  }
  return figure;
}

/** The root's children: each paragraph's content, or a block image */
function $outline(): string[] {
  return $getRoot()
    .getChildren()
    .map(child =>
      $isParagraphNode(child)
        ? `p:${child
            .getChildren()
            .map(node => ($isImageNode(node) ? '[img]' : node.getTextContent()))
            .join('|')}`
        : $isImageNode(child)
          ? '[block]'
          : child.getType(),
    );
}

/** The paragraph at `index`, counting only paragraphs */
function $paragraph(index: number): ElementNode {
  const node = $getRoot().getChildren().filter($isParagraphNode)[index];
  if (!node) {
    throw new Error(`no paragraph ${index}`);
  }
  return node;
}

/**
 * Inserts an image at the end of the first paragraph: a block with a
 * caption when `caption` is given, otherwise an inline image.
 */
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
      const image = $figure();
      expect(image.hasCaption()).toBe(true);
      expect(image.getCaption()?.getTextContent()).toBe('A mochi');
      // Slot text is part of the document's text
      expect($getRoot().getTextContent()).toContain('A mochi');
    });
    const json = editor.getEditorState().toJSON();
    expect(json.root.children[1]).toMatchObject({
      $slots: {
        caption: {
          children: [expect.objectContaining({text: 'A mochi'})],
          type: 'paragraph',
        },
      },
      block: true,
      src: 'a.png',
      type: 'mn:image',
    });

    using other = buildEditor();
    other.setEditorState(other.parseEditorState(json));
    other.read(() => {
      expect($figure().getCaption()?.getTextContent()).toBe('A mochi');
    });
  });

  it('keeps the caption when a later update clones the image', () => {
    using editor = buildEditor();
    insertImage(editor, 'A mochi');
    update(editor, () => {
      $figure().setAltText('mochi');
    });
    editor.read(() => {
      expect($figure().getCaption()?.getTextContent()).toBe('A mochi');
    });
  });

  it('adds, keeps and removes a caption with setCaption', () => {
    using editor = buildEditor();
    insertImage(editor, '');
    update(editor, () => {
      const image = $figure();
      image.setCaption(null);
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
    // The figure is a block between the paragraphs, not inside one
    expect(html).toContain(
      '</p><figure><img src="a.png" alt=""><figcaption><span style="white-space: pre-wrap;">A mochi</span></figcaption></figure><p',
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
      const image = $figure();
      expect(image.getSrc()).toBe('b.png');
      expect(image.getCaption()?.getTextContent()).toBe('From Wikipedia');
    });
  });

  it('Escape in the caption selects the image', () => {
    using editor = buildEditor();
    insertImage(editor, 'A mochi');
    update(editor, () => {
      const caption = $figure().getCaption() as ElementNode;
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
      expect(selection?.getNodes()[0].is($figure())).toBe(true);
    });
  });

  it('Backspace removes an empty caption, but not one with text', () => {
    using editor = buildEditor();
    insertImage(editor, 'x');
    update(editor, () => {
      ($figure().getCaption() as ElementNode).selectEnd();
      // Rich text deletes the character; the caption stays
      editor.dispatchCommand(KEY_BACKSPACE_COMMAND, keyEvent('Backspace'));
      expect($figure().hasCaption()).toBe(true);
      ($figure().getCaption() as ElementNode).clear().selectEnd();
    });
    update(editor, () => {
      expect(
        editor.dispatchCommand(KEY_BACKSPACE_COMMAND, keyEvent('Backspace')),
      ).toBe(true);
    });
    editor.read(() => {
      expect($figure().hasCaption()).toBe(false);
      expect($isNodeSelection($getSelection())).toBe(true);
    });
  });
});

describe('image selection', () => {
  it('selects an image when it is clicked, but not its caption', () => {
    using editor = buildEditor();
    insertImage(editor, 'A mochi');
    const key = editor.read(() => $figure().getKey());
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
      ($figure().getCaption() as ElementNode).selectEnd();
    });
    editor.setEditable(false);
    const dom = editor.read(() => editor.getElementByKey($figure().getKey()))!;
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

  it('moves a block image, with its caption, splitting the paragraph', () => {
    using editor = buildEditor();
    insertImage(editor, 'A mochi');
    const point = {node: textDOM(editor, 1), offset: 1};
    update(editor, () => {
      expect($moveImageToPoint($figure(), point)).toBe(true);
    });
    editor.read(() => {
      expect($outline()).toEqual(['p:one ', 'p:t', '[block]', 'p:wo']);
      const image = $figure();
      expect(image.getCaption()?.getTextContent()).toBe('A mochi');
      const selection = $getSelection();
      expect(selection?.getNodes()[0].is(image)).toBe(true);
    });
  });

  it('moves an inline image to another paragraph', () => {
    using editor = buildEditor();
    insertImage(editor);
    const point = {node: textDOM(editor, 1), offset: 1};
    update(editor, () => {
      expect($moveImageToPoint($images()[0], point)).toBe(true);
    });
    editor.read(() => {
      expect($outline()).toEqual(['p:one ', 'p:t|[img]|wo']);
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
      const caption = $figure().getCaption() as ElementNode;
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

describe('inline images and figures', () => {
  it('puts a block image between paragraphs and an inline one in the text', () => {
    using editor = buildEditor();
    insertImage(editor, 'A mochi');
    update(editor, () => {
      $paragraph(1).selectEnd();
      $insertNodes([$createImageNode({src: 'b.png'})]);
    });
    editor.read(() => {
      expect($outline()).toEqual(['p:one ', '[block]', 'p:two|[img]']);
    });
  });

  it('gives an inline image left in the root a paragraph', () => {
    using editor = buildEditor();
    update(editor, () => {
      $getRoot().append($createImageNode({src: 'a.png'}));
    });
    editor.read(() => {
      expect($outline()).toEqual(['p:one ', 'p:two', 'p:[img]']);
    });
  });

  it('makes a block image inside a caption inline', () => {
    using editor = buildEditor();
    insertImage(editor, 'A mochi');
    update(editor, () => {
      ($figure().getCaption() as ElementNode).append(
        $createImageNode({block: true, src: 'b.png'}),
      );
    });
    editor.read(() => {
      const caption = $figure().getCaption() as ElementNode;
      const [, image] = caption.getChildren();
      expect($isImageNode(image) && image.isInline()).toBe(true);
    });
  });

  it('inserts a block image on an empty line and an inline one in text', () => {
    using editor = buildEditor();
    update(editor, () => {
      $paragraph(0).selectEnd();
      editor.dispatchCommand(INSERT_IMAGE_COMMAND, {src: 'a.png'});
      $getRoot().append($createParagraphNode()).selectEnd();
      editor.dispatchCommand(INSERT_IMAGE_COMMAND, {src: 'b.png'});
    });
    editor.read(() => {
      expect($outline()).toEqual(['p:one |[img]', 'p:two', '[block]', 'p:']);
    });
  });

  it('adding a caption makes an inline image a block', () => {
    using editor = buildEditor();
    insertImage(editor);
    const key = editor.read(() => $images()[0].getKey());
    update(editor, () => {
      editor.dispatchCommand(SET_IMAGE_CAPTION_COMMAND, {
        caption: true,
        nodeKey: key,
      });
    });
    editor.read(() => {
      expect($outline()).toEqual(['p:one ', '[block]', 'p:two']);
      const caption = $figure().getCaption();
      const selection = $getSelection();
      expect($isRangeSelection(selection)).toBe(true);
      expect(selection?.getNodes()[0].is(caption)).toBe(true);
    });
  });

  it('sets the alt text with SET_IMAGE_ALT_TEXT_COMMAND', () => {
    using editor = buildEditor();
    insertImage(editor);
    const key = editor.read(() => $images()[0].getKey());
    let handled = false;
    update(editor, () => {
      handled = editor.dispatchCommand(SET_IMAGE_ALT_TEXT_COMMAND, {
        altText: 'A mochi',
        nodeKey: key,
      });
    });
    expect(handled).toBe(true);
    editor.read(() => {
      expect($images()[0].getAltText()).toBe('A mochi');
    });
    // Not an image
    const paragraphKey = editor.read(() =>
      $getRoot().getFirstChildOrThrow().getKey(),
    );
    update(editor, () => {
      handled = editor.dispatchCommand(SET_IMAGE_ALT_TEXT_COMMAND, {
        altText: 'nope',
        nodeKey: paragraphKey,
      });
    });
    expect(handled).toBe(false);
  });

  it('switches between inline and block, keeping the image properties', () => {
    using editor = buildEditor();
    insertImage(editor, 'A mochi');
    update(editor, () => {
      $figure().setAltText('mochi').setWidth(10);
    });
    update(editor, () => {
      editor.dispatchCommand(SET_IMAGE_BLOCK_COMMAND, {
        block: false,
        nodeKey: $figure().getKey(),
      });
    });
    const key = editor.read(() => {
      expect($outline()).toEqual(['p:one ', 'p:[img]', 'p:two']);
      const [image] = $images();
      expect(image.getAltText()).toBe('mochi');
      expect(image.getWidth()).toBe(10);
      // The caption does not survive becoming inline
      expect($getRoot().getTextContent()).not.toContain('A mochi');
      expect($getSelection()?.getNodes()[0].is(image)).toBe(true);
      return image.getKey();
    });
    update(editor, () => {
      editor.dispatchCommand(SET_IMAGE_BLOCK_COMMAND, {
        block: true,
        nodeKey: key,
      });
    });
    editor.read(() => {
      expect($outline()).toEqual(['p:one ', '[block]', 'p:two']);
      expect($figure().getAltText()).toBe('mochi');
      expect($figure().hasCaption()).toBe(false);
      // It is the same node throughout
      expect($figure().getKey()).toBe(key);
    });
  });
});
