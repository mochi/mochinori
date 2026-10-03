import type {CustomEmoji} from './customEmoji.ts';
import type {EmojiExtension} from './EmojiExtension.ts';

import {getPeerDependencyFromEditorOrThrow} from '@lexical/extension';
import {
  $create,
  $getDocument,
  $getEditor,
  addClassNamesToElement,
  DecoratorNode,
  type EditorConfig,
  type LexicalEditor,
  type LexicalNode,
  nodeSchema,
  type SerializedLexicalNode,
  type Spread,
  stringValue,
  withField,
} from 'lexical';

export type SerializedCustomEmojiNode = Spread<
  {name: string},
  SerializedLexicalNode
>;

// Declaring the field lets Lexical derive exportJSON, updateFromJSON and the
// copy in afterCloneFrom from this one schema.
const customEmojiNodeSchema = nodeSchema<CustomEmojiNode>()({
  name: withField(stringValue(), {field: '__name'}),
});

/**
 * Renders a custom emoji into its element: an `<img>` when `emoji` is known,
 * otherwise its `:name:` as text, the way chat apps show a removed emoji
 */
export function renderCustomEmoji(
  dom: HTMLElement,
  name: string,
  emoji: CustomEmoji | undefined,
): void {
  const shortcode = `:${name}:`;
  const doc = dom.ownerDocument;
  let img = dom.firstElementChild;
  if (emoji) {
    if (!img || img.tagName !== 'IMG') {
      dom.textContent = '';
      img = doc.createElement('img');
      dom.append(img);
    }
    img.setAttribute('src', emoji.src);
    img.setAttribute('alt', shortcode);
    img.setAttribute('title', shortcode);
    img.setAttribute('draggable', 'false');
  } else {
    dom.textContent = shortcode;
  }
}

/**
 * A custom emoji: an image found by its name in the custom emoji of
 * EmojiExtension, like the custom emoji of a Slack workspace or a Discord
 * server.
 *
 * The node stores only the name, so a document shows the image the app has
 * for that name now. A name the app no longer has is shown as `:name:`.
 * Its text content is `:name:` too, so plain text copies keep it.
 */
export class CustomEmojiNode extends DecoratorNode<null> {
  __name: string = '';

  $config() {
    return this.config('custom-emoji', {
      extends: DecoratorNode,
      json: customEmojiNodeSchema,
    });
  }

  getName(): string {
    return this.getLatest().__name;
  }

  setName(name: string): this {
    const self = this.getWritable();
    self.__name = name;
    return self;
  }

  getTextContent(): string {
    return `:${this.__name}:`;
  }

  isInline(): true {
    return true;
  }

  createDOM(_config: EditorConfig, editor?: LexicalEditor): HTMLElement {
    const {config, output} = getPeerDependencyFromEditorOrThrow<
      typeof EmojiExtension
    >(editor ?? $getEditor(), '@mochinori/emoji/Emoji');
    const dom = $getDocument().createElement('span');
    addClassNamesToElement(dom, config.customEmojiClass);
    dom.setAttribute('data-custom-emoji', this.__name);
    renderCustomEmoji(
      dom,
      this.__name,
      output.customEmojiByName.peek().get(this.__name),
    );
    return dom;
  }

  updateDOM(prevNode: this): boolean {
    return prevNode.__name !== this.__name;
  }

  decorate(): null {
    return null;
  }
}

/**
 * @param name - The custom emoji's name, without colons
 */
export function $createCustomEmojiNode(name: string): CustomEmojiNode {
  return $create(CustomEmojiNode).setName(name);
}

export function $isCustomEmojiNode(
  node: LexicalNode | null | undefined,
): node is CustomEmojiNode {
  return node instanceof CustomEmojiNode;
}
