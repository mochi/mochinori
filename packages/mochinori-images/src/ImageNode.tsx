import type {JSX} from 'react';

import {
  $create,
  $getDocument,
  addClassNamesToElement,
  DecoratorNode,
  type DOMConversionOutput,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalNode,
  nodeSchema,
  numberValue,
  optional,
  type SerializedLexicalNode,
  type Spread,
  stringValue,
} from 'lexical';

import {ImageComponent} from './ImageComponent.tsx';

export interface ImagePayload {
  altText?: string;
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

const imageNodeSchema = nodeSchema<ImageNode>()({
  altText: stringValue(),
  height: optional(numberValue()),
  src: stringValue(),
  width: optional(numberValue()),
});

/**
 * An inline image. `width` and `height` are the intrinsic dimensions in CSS
 * pixels when known; when absent the image renders at its natural size,
 * constrained by the editor's CSS.
 */
export class ImageNode extends DecoratorNode<JSX.Element> {
  __src: string = '';
  __altText: string = '';
  __width: number | undefined = undefined;
  __height: number | undefined = undefined;

  $config() {
    return this.config('image', {
      extends: DecoratorNode,
      importDOM: {
        img: () => ({
          conversion: $convertImageElement,
          priority: 0,
        }),
      },
      json: imageNodeSchema,
    });
  }

  afterCloneFrom(prevNode: this): void {
    super.afterCloneFrom(prevNode);
    this.__src = prevNode.__src;
    this.__altText = prevNode.__altText;
    this.__width = prevNode.__width;
    this.__height = prevNode.__height;
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

  createDOM(config: EditorConfig): HTMLElement {
    const span = $getDocument().createElement('span');
    addClassNamesToElement(span, config.theme.image);
    return span;
  }

  updateDOM(): false {
    return false;
  }

  exportDOM(): DOMExportOutput {
    const img = $getDocument().createElement('img');
    img.setAttribute('src', this.__src);
    img.setAttribute('alt', this.__altText);
    if (this.__width !== undefined) {
      img.setAttribute('width', String(this.__width));
    }
    if (this.__height !== undefined) {
      img.setAttribute('height', String(this.__height));
    }
    return {element: img};
  }

  decorate(): JSX.Element {
    return (
      <ImageComponent
        altText={this.__altText}
        height={this.__height}
        nodeKey={this.getKey()}
        src={this.__src}
        width={this.__width}
      />
    );
  }
}

function parseDimension(value: string | null): number | undefined {
  const n = value === null ? NaN : Number.parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function $convertImageElement(domNode: HTMLElement): DOMConversionOutput {
  const img = domNode as HTMLImageElement;
  const src = img.getAttribute('src');
  if (!src || src.startsWith('file:///')) {
    return {node: null};
  }
  return {
    node: $createImageNode({
      altText: img.getAttribute('alt') || '',
      height: parseDimension(img.getAttribute('height')),
      src,
      width: parseDimension(img.getAttribute('width')),
    }),
  };
}

export function $createImageNode({
  altText = '',
  height,
  src,
  width,
}: ImagePayload): ImageNode {
  return $create(ImageNode)
    .setSrc(src)
    .setAltText(altText)
    .setWidth(width)
    .setHeight(height);
}

export function $isImageNode(
  node: LexicalNode | null | undefined,
): node is ImageNode {
  return node instanceof ImageNode;
}
