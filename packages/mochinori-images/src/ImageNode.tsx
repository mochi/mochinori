import type {JSX} from 'react';

import {$appendNodeToHTML} from '@lexical/html';
import {
  $create,
  $createParagraphNode,
  $createTextNode,
  $getDocument,
  $getSlot,
  $isElementNode,
  $removeSlot,
  $setSlot,
  addClassNamesToElement,
  DecoratorNode,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalEditor,
  type LexicalNode,
  nodeSchema,
  numberValue,
  optional,
  type SerializedLexicalNode,
  type Spread,
  stringValue,
  withField,
} from 'lexical';

import {IMAGE_CAPTION_SLOT} from './ImageCaption.ts';
import {ImageComponent} from './ImageComponent.tsx';

export interface ImagePayload {
  altText?: string;
  /**
   * Text for a caption. Any string, even an empty one, gives the image a
   * caption; leave it out for none.
   */
  caption?: string;
  height?: number;
  src: string;
  width?: number;
}

export type SerializedImageNode = Spread<
  {
    altText: string;
    height?: number;
    src: string;
    width?: number;
  },
  SerializedLexicalNode
>;

// Declaring each property's field lets Lexical derive exportJSON,
// updateFromJSON and the copy in afterCloneFrom from this one schema.
const imageNodeSchema = nodeSchema<ImageNode>()({
  altText: withField(stringValue(), {field: '__altText'}),
  height: withField(optional(numberValue()), {field: '__height'}),
  src: withField(stringValue(), {field: '__src'}),
  width: withField(optional(numberValue()), {field: '__width'}),
});

/**
 * An inline image. `width` and `height` are the intrinsic dimensions in CSS
 * pixels when known; when absent the image renders at its natural size,
 * constrained by the editor's CSS.
 *
 * The caption, when there is one, is a paragraph in the image's `caption`
 * named slot. It is part of the editor's own state, so it is edited, undone,
 * serialized and synced like any other text, without a nested editor.
 */
export class ImageNode extends DecoratorNode<JSX.Element> {
  __src: string = '';
  __altText: string = '';
  __width: number | undefined = undefined;
  __height: number | undefined = undefined;

  $config() {
    return this.config('image', {
      extends: DecoratorNode,
      json: imageNodeSchema,
      slots: [IMAGE_CAPTION_SLOT],
    });
  }

  getSrc(): string {
    return this.getLatest().__src;
  }

  setSrc(src: string): this {
    const self = this.getWritable();
    self.__src = src;
    return self;
  }

  getAltText(): string {
    return this.getLatest().__altText;
  }

  setAltText(altText: string): this {
    const self = this.getWritable();
    self.__altText = altText;
    return self;
  }

  getWidth(): number | undefined {
    return this.getLatest().__width;
  }

  setWidth(width: number | undefined): this {
    const self = this.getWritable();
    self.__width = width || undefined;
    return self;
  }

  getHeight(): number | undefined {
    return this.getLatest().__height;
  }

  setHeight(height: number | undefined): this {
    const self = this.getWritable();
    self.__height = height || undefined;
    return self;
  }

  /** The caption's paragraph, or null when the image has no caption */
  getCaption(): LexicalNode | null {
    return $getSlot(this, IMAGE_CAPTION_SLOT);
  }

  hasCaption(): boolean {
    return this.getCaption() !== null;
  }

  /**
   * Sets the caption to `caption` (a non-inline node, normally a paragraph),
   * or removes it when `caption` is null. Without an argument, gives the
   * image an empty caption unless it already has one.
   */
  setCaption(caption?: LexicalNode | null): this {
    if (caption === null) {
      return $removeSlot(this, IMAGE_CAPTION_SLOT);
    }
    if (caption === undefined) {
      return this.hasCaption()
        ? this
        : $setSlot(this, IMAGE_CAPTION_SLOT, $createParagraphNode());
    }
    return $setSlot(this, IMAGE_CAPTION_SLOT, caption);
  }

  createDOM(config: EditorConfig): HTMLElement {
    const span = $getDocument().createElement('span');
    addClassNamesToElement(span, config.theme.image);
    return span;
  }

  updateDOM(): false {
    return false;
  }

  exportDOM(editor: LexicalEditor): DOMExportOutput {
    const doc = $getDocument();
    const img = doc.createElement('img');
    img.setAttribute('src', this.__src);
    img.setAttribute('alt', this.__altText);
    if (this.__width !== undefined) {
      img.setAttribute('width', String(this.__width));
    }
    if (this.__height !== undefined) {
      img.setAttribute('height', String(this.__height));
    }
    const caption = this.getCaption();
    if (caption === null) {
      return {element: img};
    }
    // A captioned image is a figure, the shape ImageFigureImportRule reads
    const figure = doc.createElement('figure');
    const figcaption = doc.createElement('figcaption');
    for (const child of $isElementNode(caption)
      ? caption.getChildren()
      : [caption]) {
      $appendNodeToHTML(editor, child, figcaption);
    }
    figure.append(img, figcaption);
    return {element: figure};
  }

  decorate(): JSX.Element {
    return (
      <ImageComponent
        altText={this.__altText}
        hasCaption={this.__slots?.has(IMAGE_CAPTION_SLOT) ?? false}
        height={this.__height}
        nodeKey={this.getKey()}
        src={this.__src}
        width={this.__width}
      />
    );
  }
}

export function $createImageNode({
  altText = '',
  caption,
  height,
  src,
  width,
}: ImagePayload): ImageNode {
  const node = $create(ImageNode)
    .setSrc(src)
    .setAltText(altText)
    .setWidth(width)
    .setHeight(height);
  if (caption !== undefined) {
    const paragraph = $createParagraphNode();
    if (caption) {
      paragraph.append($createTextNode(caption));
    }
    node.setCaption(paragraph);
  }
  return node;
}

export function $isImageNode(
  node: LexicalNode | null | undefined,
): node is ImageNode {
  return node instanceof ImageNode;
}
