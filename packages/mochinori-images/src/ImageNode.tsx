import type {JSX} from 'react';

import {$appendNodeToHTML} from '@lexical/html';
import {
  $create,
  $createParagraphNode,
  $createTextNode,
  $getDocument,
  $getSlot,
  $isElementNode,
  $isRootOrShadowRoot,
  $removeSlot,
  $setSlot,
  $splitNode,
  addClassNamesToElement,
  booleanValue,
  DecoratorNode,
  type DOMExportOutput,
  type EditorConfig,
  type ElementNode,
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
   * True for a block image, a figure between paragraphs; false or absent
   * for an inline image in the text. An image with a caption is a block.
   */
  block?: boolean;
  /**
   * Text for a caption. Any string, even an empty one, gives the image a
   * caption (and makes it a block); leave it out for none.
   */
  caption?: string;
  height?: number;
  src: string;
  width?: number;
}

export type SerializedImageNode = Spread<
  {
    altText: string;
    block?: boolean;
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
  block: withField(booleanValue(), {field: '__block'}),
  height: withField(optional(numberValue()), {field: '__height'}),
  src: withField(stringValue(), {field: '__src'}),
  width: withField(optional(numberValue()), {field: '__width'}),
});

/**
 * Keeps an image where its kind belongs: an inline image in a paragraph,
 * and a block image directly in the root or a shadow root like a table
 * cell. A block that lands in a paragraph splits it, and an inline image
 * left in the root gets a paragraph of its own.
 */
function $placeImage(node: ImageNode): void {
  const parent = node.getParent();
  if (node.isInline()) {
    if (parent !== null && $isRootOrShadowRoot(parent)) {
      // Moved, not removed, so a selection of the image survives
      const paragraph = $createParagraphNode();
      node.insertBefore(paragraph);
      paragraph.append(node);
    }
    return;
  }
  if (parent === null) {
    return;
  }
  if ($isRootOrShadowRoot(parent)) {
    // A block at the end gets an empty paragraph after it, where the caret
    // can go to keep writing
    if (node.getNextSibling() === null) {
      node.insertAfter($createParagraphNode());
    }
    return;
  }
  let top: ElementNode = parent;
  for (let up = top.getParent(); !$isRootOrShadowRoot(up);) {
    if (up === null) {
      // Inside a caption or another slot's text, where no block can go
      node.setBlock(false);
      return;
    }
    top = up;
    up = top.getParent();
  }
  const [before, after] = $splitNode(parent, node.getIndexWithinParent());
  after.insertBefore(node);
  if (before !== null && before.isEmpty()) {
    before.remove();
  }
  // An empty paragraph after a block at the end is where the caret goes next
  if (after.isEmpty() && after.getNextSibling() !== null) {
    after.remove();
  }
}

/**
 * An image. `width` and `height` are the intrinsic dimensions in CSS pixels
 * when known; when absent the image renders at its natural size,
 * constrained by the editor's CSS.
 *
 * An image is inline, in a paragraph's text, unless `block` is true: then
 * it is a figure between paragraphs, which can have a caption. Changing it
 * moves the image out of its paragraph or into one.
 *
 * The caption, when there is one, is a paragraph in the image's `caption`
 * named slot. It is part of the editor's own state, so it is edited, undone,
 * serialized and synced like any other text, without a nested editor.
 */
export class ImageNode extends DecoratorNode<JSX.Element> {
  __src: string = '';
  __altText: string = '';
  __block: boolean = false;
  __width: number | undefined = undefined;
  __height: number | undefined = undefined;

  $config() {
    return this.config('mn:image', {
      $transform: $placeImage,
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

  isInline(): boolean {
    return !this.getLatest().__block;
  }

  isBlock(): boolean {
    return this.getLatest().__block;
  }

  /**
   * Makes the image a block (a figure between paragraphs) or inline. An
   * inline image has no caption, so this removes it.
   */
  setBlock(block: boolean): this {
    let self = this.getWritable();
    self.__block = block;
    if (!block && self.hasCaption()) {
      self = $removeSlot(self, IMAGE_CAPTION_SLOT);
    }
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
   * image an empty caption unless it already has one. A captioned image is
   * a block.
   */
  setCaption(caption?: LexicalNode | null): this {
    if (caption === null) {
      return $removeSlot(this, IMAGE_CAPTION_SLOT);
    }
    const self = this.setBlock(true);
    if (caption === undefined) {
      return self.hasCaption()
        ? self
        : $setSlot(self, IMAGE_CAPTION_SLOT, $createParagraphNode());
    }
    return $setSlot(self, IMAGE_CAPTION_SLOT, caption);
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

  createDOM(config: EditorConfig): HTMLElement {
    const dom = $getDocument().createElement(this.isInline() ? 'span' : 'div');
    addClassNamesToElement(dom, config.theme.image);
    return dom;
  }

  updateDOM(prevNode: this): boolean {
    // Inline is a span and a block is a div
    return prevNode.__block !== this.__block;
  }

  /** An `<img>` with this image's src, alt text and size */
  $exportImg(): HTMLImageElement {
    const img = $getDocument().createElement('img');
    img.setAttribute('src', this.__src);
    img.setAttribute('alt', this.__altText);
    if (this.__width !== undefined) {
      img.setAttribute('width', String(this.__width));
    }
    if (this.__height !== undefined) {
      img.setAttribute('height', String(this.__height));
    }
    return img;
  }

  exportDOM(editor: LexicalEditor): DOMExportOutput {
    const img = this.$exportImg();
    if (!this.__block) {
      return {element: img};
    }
    // A block is a figure, the shape ImageFigureImportRule reads
    const doc = $getDocument();
    const figure = doc.createElement('figure');
    figure.append(img);
    const caption = this.getCaption();
    if (caption !== null) {
      const figcaption = doc.createElement('figcaption');
      for (const child of $isElementNode(caption)
        ? caption.getChildren()
        : [caption]) {
        $appendNodeToHTML(editor, child, figcaption);
      }
      figure.append(figcaption);
    }
    return {element: figure};
  }

  decorate(): JSX.Element {
    return (
      <ImageComponent
        altText={this.__altText}
        hasCaption={this.__slots?.has(IMAGE_CAPTION_SLOT) ?? false}
        height={this.__height}
        isBlock={this.__block}
        nodeKey={this.getKey()}
        src={this.__src}
        width={this.__width}
      />
    );
  }
}

export function $createImageNode({
  altText = '',
  block = false,
  caption,
  height,
  src,
  width,
}: ImagePayload): ImageNode {
  const node = $create(ImageNode)
    .setSrc(src)
    .setAltText(altText)
    .setBlock(block)
    .setWidth(width)
    .setHeight(height);
  if (caption !== undefined) {
    const paragraph = $createParagraphNode();
    if (caption) {
      paragraph.append($createTextNode(caption));
    }
    return node.setCaption(paragraph);
  }
  return node;
}

export function $isImageNode(
  node: LexicalNode | null | undefined,
): node is ImageNode {
  return node instanceof ImageNode;
}
