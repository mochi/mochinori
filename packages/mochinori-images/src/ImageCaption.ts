// Caption helpers shared by ImageNode and ImageComponent. They work by node
// key and slot name, so ImageComponent can use them without importing
// ImageNode (which imports ImageComponent).
import {
  $createNodeSelection,
  $createParagraphNode,
  $getNodeByKey,
  $getSlot,
  $isElementNode,
  $isSlotHost,
  $removeSlot,
  $setSelection,
  $setSlot,
  type NodeKey,
} from 'lexical';

/** The name of the slot that holds an image's caption */
export const IMAGE_CAPTION_SLOT = 'caption';

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

/**
 * Adds an empty caption to the image and puts the caret in it, or removes
 * the caption and selects the image.
 */
export function $setImageCaptionShown(nodeKey: NodeKey, shown: boolean): void {
  const node = $getNodeByKey(nodeKey);
  if (!node || !$isSlotHost(node)) {
    return;
  }
  if (!shown) {
    $removeSlot(node, IMAGE_CAPTION_SLOT);
    $selectImage(nodeKey);
    return;
  }
  let caption = $getSlot(node, IMAGE_CAPTION_SLOT);
  if (!caption) {
    caption = $createParagraphNode();
    $setSlot(node, IMAGE_CAPTION_SLOT, caption);
  }
  if ($isElementNode(caption)) {
    caption.selectEnd();
  }
}
