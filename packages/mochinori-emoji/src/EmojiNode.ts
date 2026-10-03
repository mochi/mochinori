import type {CustomEmoji} from './customEmoji.ts';
import type {EmojiExtension} from './EmojiExtension.ts';

import {getPeerDependencyFromEditorOrThrow} from '@lexical/extension';
import {
  $create,
  $getEditor,
  addClassNamesToElement,
  type DOMExportOutput,
  type EditorConfig,
  isHTMLElement,
  type LexicalEditor,
  type LexicalNode,
  type LexicalParseJSON,
  nodeSchema,
  optional,
  type SerializedPartial,
  type SerializedTextNode,
  type Spread,
  stringValue,
  TextNode,
  withField,
} from 'lexical';

export type SerializedEmojiNode = Spread<
  {name?: string; shortcode?: string},
  SerializedTextNode
>;

// Declaring the fields lets Lexical derive exportJSON, updateFromJSON and the
// copy in afterCloneFrom from this one schema.
const emojiNodeSchema = nodeSchema<EmojiNode>()({
  name: withField(optional(stringValue()), {field: '__name'}),
  shortcode: withField(optional(stringValue()), {field: '__shortcode'}),
});

// The JSON types of the methods the schema derives
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface EmojiNode {
  exportJSON(compact?: false): SerializedEmojiNode;
  exportJSON(compact: boolean): SerializedPartial<SerializedEmojiNode>;
  updateFromJSON(serializedNode: LexicalParseJSON<SerializedEmojiNode>): this;
}

/**
 * Shows a custom emoji's image as the background of its element. Its
 * `:name:` text stays inside, at zero size, with the letters spread across
 * the image (by an inherited `letter-spacing`) so that the caret before the
 * text is at the image's left edge and the caret after it at the right
 * edge. Without an image (a name the app no longer has) the text shows
 * instead, the way chat apps show a removed emoji.
 */
export function renderCustomEmoji(
  dom: HTMLElement,
  name: string,
  emoji: CustomEmoji | undefined,
): void {
  const text = dom.firstElementChild as HTMLElement | null;
  if (!text) {
    return;
  }
  const length = name.length + 2;
  const label = `:${name}:`;
  if (emoji) {
    dom.setAttribute('role', 'img');
    dom.setAttribute('aria-label', label);
    dom.setAttribute('title', label);
    Object.assign(dom.style, {
      backgroundImage: `url(${JSON.stringify(emoji.src)})`,
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      backgroundSize: 'contain',
      display: 'inline-block',
      height: '1.25em',
      letterSpacing: `calc(1.25em / ${length})`,
      verticalAlign: '-0.25em',
    });
    Object.assign(text.style, {color: 'transparent', fontSize: '0'});
  } else {
    for (const attr of ['role', 'aria-label', 'title']) {
      dom.removeAttribute(attr);
    }
    for (const prop of [
      'background-image',
      'background-position',
      'background-repeat',
      'background-size',
      'display',
      'height',
      'letter-spacing',
      'vertical-align',
    ]) {
      dom.style.removeProperty(prop);
    }
    text.style.removeProperty('color');
    text.style.removeProperty('font-size');
  }
}

/**
 * An emoji: a Unicode emoji such as 🙂, with the shortcode it was typed as
 * (such as `:)`), or a custom emoji, whose text is its `:name:` and which is
 * shown as the image the app has for that name.
 *
 * {@link $createEmojiNode} and {@link $createCustomEmojiNode} put the node in
 * token mode, so it is treated as an "atomic" unit and not considered for
 * further text transforms. EmojiExtension moves the caret across it in one
 * step.
 *
 * The display of Unicode emoji is implemented in the mutation listener set up
 * by EmojiExtension, which makes it a little easier to ensure that clean-up is
 * done properly.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class EmojiNode extends TextNode {
  __shortcode: string | undefined = undefined;
  __name: string | undefined = undefined;

  $config() {
    return this.config('mn:emoji', {
      extends: TextNode,
      json: emojiNodeSchema,
    });
  }

  updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    if (this.__name !== undefined || prevNode.__name !== undefined) {
      // A custom emoji's text is wrapped, which TextNode's own update doesn't
      // expect (it would add a second text node), so any change recreates it
      return (
        prevNode.__name !== this.__name ||
        prevNode.__text !== this.__text ||
        prevNode.__format !== this.__format ||
        prevNode.__style !== this.__style
      );
    }
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
    const emojiExtension = getPeerDependencyFromEditorOrThrow<
      typeof EmojiExtension
    >(editor ?? $getEditor(), '@mochinori/emoji/Emoji');
    const name = this.__name;
    if (name !== undefined) {
      addClassNamesToElement(dom, emojiExtension.config.customEmojiClass);
      dom.dataset.customEmoji = name;
      // The text stays in the document, where Lexical finds it, in a span
      // of its own that renderCustomEmoji shrinks
      const text = dom.ownerDocument.createElement('span');
      text.append(...dom.childNodes);
      dom.append(text);
      renderCustomEmoji(
        dom,
        name,
        emojiExtension.output.customEmojiByName.peek().get(name),
      );
    } else {
      addClassNamesToElement(dom, emojiExtension.config.emojiClass);
      if (this.__shortcode) {
        dom.dataset.emojiShortcode = this.__shortcode;
      }
    }
    return dom;
  }

  exportDOM(editor: LexicalEditor): DOMExportOutput {
    const output = super.exportDOM(editor);
    const name = this.__name;
    const {element} = output;
    if (name === undefined || !isHTMLElement(element)) {
      return output;
    }
    const dom = element.matches('[data-custom-emoji]')
      ? element
      : element.querySelector<HTMLElement>('[data-custom-emoji]');
    const emoji = getPeerDependencyFromEditorOrThrow<typeof EmojiExtension>(
      editor,
      '@mochinori/emoji/Emoji',
    )
      .output.customEmojiByName.peek()
      .get(name);
    if (dom && emoji) {
      // Other apps get a plain image, with the name as its alt text
      renderCustomEmoji(dom, name, undefined);
      const img = dom.ownerDocument.createElement('img');
      img.src = emoji.src;
      img.alt = `:${name}:`;
      img.title = img.alt;
      Object.assign(img.style, {height: '1.25em', verticalAlign: '-0.25em'});
      dom.replaceChildren(img);
    }
    return output;
  }

  getShortcode(): string | undefined {
    return this.getLatest().__shortcode;
  }

  setShortcode(shortcode: string | undefined): this {
    const self = this.getWritable();
    self.__shortcode = shortcode || undefined;
    return self;
  }

  /** The name of a custom emoji, or `undefined` for a Unicode emoji */
  getName(): string | undefined {
    return this.getLatest().__name;
  }

  setName(name: string | undefined): this {
    const self = this.getWritable();
    self.__name = name || undefined;
    return self;
  }

  /** Whether this is a custom emoji rather than a Unicode one */
  isCustom(): boolean {
    return this.getName() !== undefined;
  }
}

/**
 * @param text - The emoji string (a decoded unified id)
 * @param shortcode - The text it replaced, such as `:)`
 * @returns the EmojiNode
 */
export function $createEmojiNode(text: string, shortcode?: string): EmojiNode {
  // In token mode the node is deleted as a single entity (not individually
  // by character). This also forces Lexical to create adjacent TextNode on
  // user input instead of modifying Emoji node as it now acts as immutable
  // node.
  return $create(EmojiNode)
    .setTextContent(text)
    .setShortcode(shortcode)
    .setMode('token');
}

/**
 * @param name - The custom emoji's name, without colons
 * @returns an EmojiNode whose text is `:name:`
 */
export function $createCustomEmojiNode(name: string): EmojiNode {
  return $create(EmojiNode)
    .setTextContent(`:${name}:`)
    .setName(name)
    .setMode('token');
}

export function $isEmojiNode(
  node: LexicalNode | null | undefined,
): node is EmojiNode {
  return node instanceof EmojiNode;
}

/** Whether `node` is a custom emoji */
export function $isCustomEmojiNode(
  node: LexicalNode | null | undefined,
): node is EmojiNode {
  return $isEmojiNode(node) && node.isCustom();
}
