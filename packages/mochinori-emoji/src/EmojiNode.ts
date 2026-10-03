import type {EmojiExtension} from './EmojiExtension.ts';

import {getPeerDependencyFromEditorOrThrow} from '@lexical/extension';
import {
  $create,
  $getEditor,
  addClassNamesToElement,
  type EditorConfig,
  type LexicalEditor,
  type LexicalNode,
  nodeSchema,
  optional,
  type SerializedTextNode,
  type Spread,
  stringValue,
  TextNode,
  withField,
} from 'lexical';

export type SerializedEmojiNode = Spread<
  {shortcode?: string},
  SerializedTextNode
>;

// Declaring the field lets Lexical derive exportJSON, updateFromJSON and the
// copy in afterCloneFrom from this one schema.
const emojiNodeSchema = nodeSchema<EmojiNode>()({
  shortcode: withField(optional(stringValue()), {field: '__shortcode'}),
});

/**
 * An emoji, such as 🙂, and the shortcode it was typed as, such as `:)`.
 *
 * {@link $createEmojiNode} puts the node in token mode, so it is treated as
 * an "atomic" unit and not considered for further text transforms.
 *
 * The display behavior is all implemented in the mutation listener set up
 * by EmojiExtension, which makes it a little easier to ensure that clean-up is
 * done properly.
 */
export class EmojiNode extends TextNode {
  __shortcode: string | undefined = undefined;

  $config() {
    return this.config('emoji', {
      extends: TextNode,
      json: emojiNodeSchema,
    });
  }

  updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    if (super.updateDOM(prevNode, dom, config)) {
      return true;
    }
    if (prevNode.__shortcode !== this.__shortcode) {
      if (this.__shortcode) {
        dom.dataset.emojiShortcode = this.__shortcode;
      } else {
        delete dom.dataset.emojiShortcode;
      }
    }
    return false;
  }

  createDOM(config: EditorConfig, editor?: LexicalEditor): HTMLElement {
    const dom = super.createDOM(config, editor);
    // We reference this as a peer dependency so we can avoid a circular
    // import. If this was in the same file as the extension definition it
    // would not be an issue. It is fine to have circular type imports.
    // Alternatively, we could include this code in the mutation listener,
    // but that would not run in the default implementation of exportDOM.
    addClassNamesToElement(
      dom,
      getPeerDependencyFromEditorOrThrow<typeof EmojiExtension>(
        editor ?? $getEditor(),
        '@mochinori/emoji/Emoji',
      ).config.emojiClass,
    );
    if (this.__shortcode) {
      dom.dataset.emojiShortcode = this.__shortcode;
    }
    return dom;
  }

  getShortcode(): string | undefined {
    return this.getLatest().__shortcode;
  }

  setShortcode(shortcode: string | undefined): this {
    const self = this.getWritable();
    self.__shortcode = shortcode || undefined;
    return self;
  }
}

/**
 * @param text - The emoji string (a decoded unified id)
 * @param shortcode - The text it replaced, such as `:)`
 * @returns the EmojiNode
 */
export function $createEmojiNode(text: string, shortcode?: string): EmojiNode {
  // In token mode node can be navigated through character-by-character,
  // but are deleted as a single entity (not individually by character).
  // This also forces Lexical to create adjacent TextNode on user input instead of
  // modifying Emoji node as it now acts as immutable node.
  return $create(EmojiNode)
    .setTextContent(text)
    .setShortcode(shortcode)
    .setMode('token');
}

export function $isEmojiNode(
  node: LexicalNode | null | undefined,
): node is EmojiNode {
  return node instanceof EmojiNode;
}
