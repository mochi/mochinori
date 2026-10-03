import {effect, WatchEditableExtension} from '@lexical/extension';
import {
  $getNodeByKey,
  $getSelection,
  $insertNodes,
  $isParagraphNode,
  $isRangeSelection,
  $isRootOrShadowRoot,
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  defineExtension,
  type LexicalCommand,
  mergeRegister,
} from 'lexical';

import {
  $focusCaptionWhenMounted,
  $selectCaptionEnd,
  $selectImage,
  SET_IMAGE_BLOCK_COMMAND,
  SET_IMAGE_CAPTION_COMMAND,
} from './ImageCaption.ts';
import {registerImageInteractions} from './ImageInteractions.ts';
import {
  $createImageNode,
  $isImageNode,
  ImageNode,
  type ImagePayload,
} from './ImageNode.tsx';

/**
 * Inserts an image at the selection. When `block` is left out, an image
 * with a `caption` is a block, and so is one inserted on a line of its own
 * (an empty paragraph); otherwise it is inline.
 */
export const INSERT_IMAGE_COMMAND: LexicalCommand<ImagePayload> = createCommand(
  'INSERT_IMAGE_COMMAND',
);

/**
 * Whether an image inserted at the selection without saying which kind it
 * is should be a block: it is, on a line of its own (an empty paragraph).
 */
export function $isBlockImagePlace(): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false;
  }
  const node = selection.anchor.getNode();
  return (
    $isParagraphNode(node) &&
    node.isEmpty() &&
    $isRootOrShadowRoot(node.getParent())
  );
}

/** An image as {@link INSERT_IMAGE_COMMAND} describes it */
export function $createImageForSelection(payload: ImagePayload): ImageNode {
  return $createImageNode({
    ...payload,
    block:
      payload.block ?? (payload.caption !== undefined || $isBlockImagePlace()),
  });
}

/**
 * Registers {@link ImageNode}, handles {@link INSERT_IMAGE_COMMAND} by
 * inserting an image at the current selection, and handles
 * `SET_IMAGE_CAPTION_COMMAND` and `SET_IMAGE_BLOCK_COMMAND`, which the
 * image's buttons dispatch.
 *
 * Clicking an image selects it (shift-click adds to the selection), and an
 * image can be dragged to move it. In a caption, Escape selects the image,
 * Backspace in an empty caption removes it, and the arrow keys leave it at
 * either end. None of this happens while the editor is read-only.
 *
 * Add `ImageUploadExtension` to upload files.
 */
export const ImagesExtension = defineExtension({
  dependencies: [WatchEditableExtension],
  name: '@mochinori/images/Images',
  nodes: () => [ImageNode],
  register: (editor, _config, state) => {
    const editable = state.getDependency(WatchEditableExtension).output;
    return mergeRegister(
      editor.registerCommand(
        INSERT_IMAGE_COMMAND,
        payload => {
          $insertNodes([$createImageForSelection(payload)]);
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand(
        SET_IMAGE_CAPTION_COMMAND,
        ({caption, nodeKey}) => {
          const image = $getNodeByKey(nodeKey);
          if (!$isImageNode(image)) {
            return false;
          }
          if (!caption) {
            image.setCaption(null);
            $selectImage(nodeKey);
            return true;
          }
          image.setCaption();
          $selectCaptionEnd(nodeKey);
          $focusCaptionWhenMounted(nodeKey);
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand(
        SET_IMAGE_BLOCK_COMMAND,
        ({block, nodeKey}) => {
          const image = $getNodeByKey(nodeKey);
          if (!$isImageNode(image)) {
            return false;
          }
          image.setBlock(block);
          $selectImage(nodeKey);
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      // Registered only while the editor is editable
      effect(() =>
        editable.value ? registerImageInteractions(editor) : undefined,
      ),
    );
  },
});
