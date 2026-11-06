import {
  buildEditorFromExtensions,
  getExtensionDependencyFromEditor,
} from '@lexical/extension';
import {$generateHtmlFromNodes, DOMImportExtension} from '@lexical/html';
import {RichTextExtension} from '@lexical/rich-text';
import {
  $createParagraphNode,
  $getRoot,
  $insertNodes,
  $isElementNode,
  defineExtension,
} from 'lexical';
import {describe, expect, it} from 'vitest';

import {
  $createImageNode,
  $isImageNode,
  type ImageNode,
  ImagesExtension,
  INSERT_IMAGE_COMMAND,
} from '../../index.ts';

function buildEditor() {
  return buildEditorFromExtensions(
    defineExtension({
      $initialEditorState: () => {
        const paragraph = $createParagraphNode();
        $getRoot().append(paragraph);
        paragraph.select();
      },
      dependencies: [RichTextExtension, ImagesExtension],
      name: '[root]',
    }),
  );
}

function $getImages(): ImageNode[] {
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

describe('ImagesExtension', () => {
  it('inserts an image with INSERT_IMAGE_COMMAND', () => {
    using editor = buildEditor();
    editor.update(
      () => {
        editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
          altText: 'mochi',
          src: 'https://example.com/mochi.png',
          width: 64,
        });
      },
      {discrete: true},
    );
    editor.read(() => {
      const images = $getImages();
      expect(images).toHaveLength(1);
      expect(images[0].getSrc()).toBe('https://example.com/mochi.png');
      expect(images[0].getAltText()).toBe('mochi');
      expect(images[0].getWidth()).toBe(64);
      expect(images[0].getHeight()).toBe(undefined);
    });
  });

  it('keeps its properties when cloned by a later update', () => {
    using editor = buildEditor();
    editor.update(
      () => {
        $insertNodes([
          $createImageNode({altText: 'a', height: 20, src: 'a.png', width: 10}),
        ]);
      },
      {discrete: true},
    );
    editor.update(
      () => {
        $getImages()[0].setAltText('b');
      },
      {discrete: true},
    );
    editor.read(() => {
      const [image] = $getImages();
      expect(image.getAltText()).toBe('b');
      expect(image.getSrc()).toBe('a.png');
      expect(image.getWidth()).toBe(10);
      expect(image.getHeight()).toBe(20);
    });
  });

  it('round-trips through JSON', () => {
    using editor = buildEditor();
    editor.update(
      () => {
        $insertNodes([
          $createImageNode({altText: 'a', height: 20, src: 'a.png', width: 10}),
        ]);
      },
      {discrete: true},
    );
    const json = editor.getEditorState().toJSON();
    const [paragraph] = json.root.children as unknown as [
      {children: Record<string, unknown>[]},
    ];
    expect(paragraph.children[0]).toEqual({
      altText: 'a',
      block: false,
      height: 20,
      src: 'a.png',
      type: 'mn:image',
      version: 1,
      width: 10,
    });

    using other = buildEditor();
    other.setEditorState(other.parseEditorState(json));
    other.read(() => {
      const [image] = $getImages();
      expect(image.getSrc()).toBe('a.png');
      expect(image.getWidth()).toBe(10);
      expect(image.getHeight()).toBe(20);
    });
  });

  it('exports and imports <img> HTML', () => {
    using editor = buildEditor();
    editor.update(
      () => {
        $insertNodes([
          $createImageNode({altText: 'alt', src: 'https://example.com/a.png'}),
        ]);
      },
      {discrete: true},
    );
    const html = editor.read(() => $generateHtmlFromNodes(editor));
    expect(html).toContain('<img src="https://example.com/a.png" alt="alt">');

    using other = buildEditor();
    const {$generateNodesFromDOM} = getExtensionDependencyFromEditor(
      other,
      DOMImportExtension,
    ).output;
    other.update(
      () => {
        const dom = new DOMParser().parseFromString(html, 'text/html');
        $getRoot().clear().select();
        $insertNodes($generateNodesFromDOM(dom));
      },
      {discrete: true},
    );
    other.read(() => {
      const [image] = $getImages();
      expect(image.getSrc()).toBe('https://example.com/a.png');
      expect(image.getAltText()).toBe('alt');
    });
  });

  it('imports <img> dimensions and skips local file images', () => {
    using editor = buildEditor();
    const {$generateNodesFromDOM} = getExtensionDependencyFromEditor(
      editor,
      DOMImportExtension,
    ).output;
    editor.update(
      () => {
        const dom = new DOMParser().parseFromString(
          '<p><img src="a.png" width="10" height="20px">' +
            '<img src="file:///tmp/b.png"></p>',
          'text/html',
        );
        $getRoot().clear().select();
        $insertNodes($generateNodesFromDOM(dom));
      },
      {discrete: true},
    );
    editor.read(() => {
      const images = $getImages();
      expect(images).toHaveLength(1);
      expect(images[0].getSrc()).toBe('a.png');
      expect(images[0].getWidth()).toBe(10);
      expect(images[0].getHeight()).toBe(20);
    });
  });
});
