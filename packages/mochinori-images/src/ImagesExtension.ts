import {effect, namedSignals} from '@lexical/extension';
import {
  $insertNodes,
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  defineExtension,
  type LexicalCommand,
  safeCast,
} from 'lexical';

import {$createImageNode, ImageNode, type ImagePayload} from './ImageNode.tsx';

export const INSERT_IMAGE_COMMAND: LexicalCommand<ImagePayload> = createCommand(
  'INSERT_IMAGE_COMMAND',
);

export interface ImagesConfig {
  /** When true, INSERT_IMAGE_COMMAND is not handled */
  disabled: boolean;
}

/**
 * Registers {@link ImageNode} and handles {@link INSERT_IMAGE_COMMAND} by
 * inserting an image at the current selection.
 *
 * Upload support is not implemented yet.
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
      return editor.registerCommand(
        INSERT_IMAGE_COMMAND,
        payload => {
          $insertNodes([$createImageNode(payload)]);
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      );
    });
  },
});
