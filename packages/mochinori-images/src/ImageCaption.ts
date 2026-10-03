// Caption helpers and commands shared by ImageNode and ImageComponent. They
// work by node key and slot name, so ImageComponent can use them without
// importing ImageNode (which imports ImageComponent).
import {
  $createNodeSelection,
  $getEditor,
  $getNodeByKey,
  $getSlot,
  $isElementNode,
  $setSelection,
  createCommand,
  type LexicalCommand,
  type LexicalEditor,
  type NodeKey,
} from 'lexical';

/** The name of the slot that holds a block image's caption */
export const IMAGE_CAPTION_SLOT = 'caption';

/**
 * Gives the image a caption and puts the caret in it, or removes the caption
 * and selects the image. An inline image becomes a block to get one.
 */
export const SET_IMAGE_CAPTION_COMMAND: LexicalCommand<{
  caption: boolean;
  nodeKey: NodeKey;
}> = createCommand('SET_IMAGE_CAPTION_COMMAND');

/**
 * Makes the image a block (a figure between paragraphs, which can have a
 * caption) or an inline image in the text, and selects it.
 */
export const SET_IMAGE_BLOCK_COMMAND: LexicalCommand<{
  block: boolean;
  nodeKey: NodeKey;
}> = createCommand('SET_IMAGE_BLOCK_COMMAND');

/** Selects the image as a whole (a NodeSelection) */
export function $selectImage(nodeKey: NodeKey): void {
  const selection = $createNodeSelection();
  selection.add(nodeKey);
  $setSelection(selection);
}

/** True when the image has no caption, or a caption with no text */
export function $isImageCaptionEmpty(nodeKey: NodeKey): boolean {
  const node = $getNodeByKey(nodeKey);
  const caption = node && $getSlot(node, IMAGE_CAPTION_SLOT);
  return !caption || caption.getTextContentSize() === 0;
}

// Captions that were just added and get the focus once they are mounted.
// Kept outside React: an image that becomes a block gets a new DOM element,
// and a new component with it.
const captionsToFocus = new WeakMap<LexicalEditor, Set<NodeKey>>();

/** Asks the image's caption to take the focus once it is mounted */
export function $focusCaptionWhenMounted(nodeKey: NodeKey): void {
  const editor = $getEditor();
  let keys = captionsToFocus.get(editor);
  if (keys === undefined) {
    keys = new Set();
    captionsToFocus.set(editor, keys);
  }
  keys.add(nodeKey);
}

/** True, once, after {@link $focusCaptionWhenMounted} for this image */
export function takeCaptionFocus(
  editor: LexicalEditor,
  nodeKey: NodeKey,
): boolean {
  return captionsToFocus.get(editor)?.delete(nodeKey) ?? false;
}

/** Puts the caret at the end of the image's caption, if it has one */
export function $selectCaptionEnd(nodeKey: NodeKey): void {
  const node = $getNodeByKey(nodeKey);
  const caption = node && $getSlot(node, IMAGE_CAPTION_SLOT);
  if ($isElementNode(caption)) {
    caption.selectEnd();
  }
}
