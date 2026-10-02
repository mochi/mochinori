import {effect, WatchEditableExtension} from '@lexical/extension';
import {
  $insertNodes,
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  defineExtension,
  type LexicalCommand,
  mergeRegister,
} from 'lexical';

import {registerImageInteractions} from './ImageInteractions.ts';
import {$createImageNode, ImageNode, type ImagePayload} from './ImageNode.tsx';

export const INSERT_IMAGE_COMMAND: LexicalCommand<ImagePayload> = createCommand(
  'INSERT_IMAGE_COMMAND',
);

/**
 * Registers {@link ImageNode} and handles {@link INSERT_IMAGE_COMMAND} by
 * inserting an image at the current selection.
 *
 * Clicking an image selects it (shift-click adds to the selection), and an
 * image can be dragged to move it. Images have optional captions: in a
 * caption, Escape selects the image, Backspace in an empty caption removes
 * it, and the arrow keys leave it at either end. None of this happens
 * while the editor is read-only.
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
          $insertNodes([$createImageNode(payload)]);
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
