import {effect, WatchEditableExtension} from '@lexical/extension';
import {
  addClassNamesToElement,
  defineExtension,
  type LexicalEditor,
  mergeRegister,
  type NodeKey,
  removeClassNamesFromElement,
  safeCast,
  TextNode,
} from 'lexical';

import {loadTextNodeTransform} from '#loadTextNodeTransform';

import {
  type EmojiEntryParser,
  parseEmojiShortNamesAndTexts,
} from './emojiEntries.ts';
import {EmojiNode} from './EmojiNode.ts';
import {unifiedIDFromText} from './unifiedID.ts';

/**
 * The version of emoji-datasource-facebook that the emoji database and the
 * default {@link EmojiExtensionConfig.emojiBaseUrl} come from
 */
export const EMOJI_DATASOURCE_VERSION = '15.1.2';

export interface EmojiExtensionConfig {
  /**
   * The base URL to find the emoji PNG files, from the 64x64 set in
   * emoji-datasource-facebook (`img/facebook/64` in that package). Each file
   * is named by the emoji's unified id, such as `1f642.png`.
   *
   * Default: the emoji-datasource-facebook package on jsDelivr.
   * Do not add a trailing slash to the path.
   */
  emojiBaseUrl: string;
  /**
   * The class to use for emoji nodes. Style it to show the background image
   * at the size of the text, such as:
   *
   * ```css
   * .mochinori-emoji {
   *   display: inline-block;
   *   width: 1em;
   *   height: 1em;
   *   background: center / 1em 1em no-repeat;
   *   vertical-align: top;
   * }
   * ```
   */
  emojiClass: string;
  /**
   * The class to use for emoji nodes before the image is loaded
   */
  emojiLoadingClass: string;
  /**
   * The class to use for emoji nodes after the image is loaded and set as a
   * background-image. Style it to hide the text, such as
   * `color: transparent`, so the image shows instead of the font's emoji.
   */
  emojiLoadedClass: string;
  /**
   * The function to use to parse the emoji database and build the text -> emoji mapping
   */
  parseEmojiReplacementEntry: EmojiEntryParser;
}

function resolve<T extends (...args: never[]) => unknown>(
  arg: Promise<T> | T,
  fn: (v: T) => void,
) {
  if (typeof arg === 'function') {
    fn(arg);
  } else {
    void arg.then(fn);
  }
}

/**
 * An extension to use the emoji-datasource-facebook emoji database to convert
 * short names such as :man-facepalming: or :) to their corresponding
 * emoji, and uses an image from the same package rather than the current
 * font to display it so that the display is consistent regardless of the
 * platform.
 *
 * Loading the emoji database is done using an async import so will typically
 * be a lazy loaded module in a separate chunk (Node loads it synchronously).
 * Shortcodes are only converted while the editor is editable.
 *
 * Images are also maximally lazily loaded, before they load the font's
 * representation of that emoji is used and then the emojiLoadedClass is
 * added.
 */
export const EmojiExtension = defineExtension({
  config: safeCast<EmojiExtensionConfig>({
    emojiBaseUrl: `https://cdn.jsdelivr.net/npm/emoji-datasource-facebook@${EMOJI_DATASOURCE_VERSION}/img/facebook/64`,
    emojiClass: 'mochinori-emoji',
    emojiLoadedClass: 'mochinori-emoji--loaded',
    emojiLoadingClass: '',
    parseEmojiReplacementEntry: parseEmojiShortNamesAndTexts,
  }),
  dependencies: [WatchEditableExtension],
  name: '@mochinori/emoji/Emoji',
  nodes: () => [EmojiNode],
  register(editor: LexicalEditor, config, state) {
    const editable = state.getDependency(WatchEditableExtension).output;
    const nodeCleanup = new Map<NodeKey, () => void>();
    const runNodeCleanup = (nodeKey: NodeKey) => {
      const fn = nodeCleanup.get(nodeKey);
      if (fn) {
        nodeCleanup.delete(nodeKey);
        fn();
      }
    };
    const cleanup = mergeRegister(
      // no need for init since we are synchronously registering at editor creation
      editor.registerMutationListener(EmojiNode, nodes => {
        // Everything we already need is in the DOM, otherwise we would
        // want to get the node reference from here as well
        // (using editor.update and $getNodeByKey).
        for (const [nodeKey, mutation] of nodes) {
          runNodeCleanup(nodeKey);
          const dom =
            mutation === 'destroyed' ? null : editor.getElementByKey(nodeKey);
          if (!dom?.textContent) {
            continue;
          }
          // A possible future enhancement would be to allow both image
          // emojis and plain text emojis that we do not have images for,
          // in which case we would want to have a separate class and not
          // use a background image if we don't have one.
          const imageUrl = `${config.emojiBaseUrl}/${unifiedIDFromText(dom.textContent)}.png`;
          addClassNamesToElement(
            dom,
            config.emojiClass,
            config.emojiLoadingClass,
          );
          dom.style.backgroundImage = `url(${imageUrl})`;
          const img = dom.ownerDocument.createElement('img');
          const cleanupImg = () => {
            img.onload = img.onerror = null;
          };
          const eagerNodeCleanup = () => {
            cleanupImg();
            nodeCleanup.delete(nodeKey);
            removeClassNamesFromElement(dom, config.emojiLoadingClass);
          };
          img.onerror = eagerNodeCleanup;
          img.onload = () => {
            eagerNodeCleanup();
            addClassNamesToElement(dom, config.emojiLoadedClass);
          };
          nodeCleanup.set(nodeKey, cleanupImg);
          img.src = imageUrl;
        }
      }),
      () => {
        for (const fn of nodeCleanup.values()) {
          fn();
        }
        nodeCleanup.clear();
      },
    );
    // Defer loading of the transform which needs to load the emoji JSON
    resolve(loadTextNodeTransform(), createTextNodeTransform => {
      const abortSignal = state.getSignal();
      if (!abortSignal.aborted) {
        const $textNodeTransform = createTextNodeTransform(
          config.parseEmojiReplacementEntry,
        );
        abortSignal.addEventListener(
          'abort',
          // Registered only while the editor is editable
          effect(() =>
            editable.value
              ? editor.registerNodeTransform(TextNode, $textNodeTransform)
              : undefined,
          ),
          {once: true},
        );
      }
    });
    return cleanup;
  },
});
