import type {JSX} from 'react';

import {
  $create,
  $getDocument,
  addClassNamesToElement,
  DecoratorNode,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalNode,
  nodeSchema,
  numberValue,
  optional,
  type SerializedLexicalNode,
  type Spread,
  stringValue,
  withField,
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
