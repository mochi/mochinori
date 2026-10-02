import {effect, namedSignals} from '@lexical/extension';
import {
  $insertNodes,
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  defineExtension,
  type LexicalCommand,
  mergeRegister,
  safeCast,
} from 'lexical';

import {registerImageInteractions} from './ImageInteractions.ts';
import {$createImageNode, ImageNode, type ImagePayload} from './ImageNode.tsx';

export const INSERT_IMAGE_COMMAND: LexicalCommand<ImagePayload> = createCommand(
  'INSERT_IMAGE_COMMAND',
);

export interface ImagesConfig {
  /**
   * When true, INSERT_IMAGE_COMMAND is not handled, and images can't be
   * selected by clicking or moved by dragging
   */
  disabled: boolean;
}

/**
 * Registers {@link ImageNode} and handles {@link INSERT_IMAGE_COMMAND} by
 * inserting an image at the current selection.
 *
 * Clicking an image selects it (shift-click adds to the selection), and an
 * image can be dragged to move it. Images have optional captions: in a
 * caption, Escape selects the image, Backspace in an empty caption removes
 * it, and the arrow keys leave it at either end.
 *
 * Add `ImageUploadExtension` to upload files.
 */
export const ImagesExtension = defineExtension({
  build: (_editor, config) => namedSignals(config),
  config: safeCast<ImagesConfig>({disabled: false}),
  name: '@mochinori/images/Images',
  nodes: () => [ImageNode],
  register: (editor, _config, state) => {
    const {disabled} = state.getOutput();
    return effect(() => {
      if (disabled.value) {
        return;
      }
      return mergeRegister(
        editor.registerCommand(
          INSERT_IMAGE_COMMAND,
          payload => {
            $insertNodes([$createImageNode(payload)]);
            return true;
          },
          COMMAND_PRIORITY_EDITOR,
        ),
        registerImageInteractions(editor),
      );
    });
  },
});
