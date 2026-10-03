import type {CustomEmoji, CustomEmojiMap} from './customEmoji.ts';

import {
  computed,
  effect,
  type ReadonlySignal,
  type Signal,
  signal,
  WatchEditableExtension,
} from '@lexical/extension';
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
import {EmojiNode, renderCustomEmoji} from './EmojiNode.ts';
import {registerEmojiNavigation} from './registerEmojiNavigation.ts';
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
  /**
   * The custom emoji that `:name:` turns into, beyond the Unicode set. This is
   * the initial value of the extension's `customEmoji` output signal; set
   * that signal to change them while the editor runs.
   */
  customEmoji: readonly CustomEmoji[];
  /**
   * The class to use for custom emoji. The element holds an `<img>`, or the
   * `:name:` text for a name that is not in `customEmoji`.
   */
  customEmojiClass: string;
}

export interface EmojiExtensionOutput {
  /**
   * The custom emoji. Set it to add, change or remove custom emoji while the
   * editor runs: existing custom emoji show their new image (or their
   * `:name:` once removed), and shortcodes already typed for a new name
   * turn into emoji.
   */
  customEmoji: Signal<readonly CustomEmoji[]>;
  /** {@link EmojiExtensionOutput.customEmoji} by name */
  customEmojiByName: ReadonlySignal<CustomEmojiMap>;
}

function resolve<T extends (...args: never[]) => unknown>(
  arg: Promise<T> | T,
  fn: (v: T) => void,
  onError: (error: unknown) => void,
) {
  if (typeof arg === 'function') {
    fn(arg);
  } else {
    arg.then(fn, onError);
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
 *
 * Custom emoji (`customEmoji`) extend the set beyond Unicode with images,
 * typed as `:name:` and stored as an {@link EmojiNode} with that name.
 */
export const EmojiExtension = defineExtension({
  build(_editor, config): EmojiExtensionOutput {
    const customEmoji = signal(config.customEmoji);
    const customEmojiByName = computed<CustomEmojiMap>(
      () => new Map(customEmoji.value.map(emoji => [emoji.name, emoji])),
    );
    return {customEmoji, customEmojiByName};
  },
  config: safeCast<EmojiExtensionConfig>({
    customEmoji: [],
    customEmojiClass: 'mochinori-custom-emoji',
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
    const {customEmojiByName} = state.getOutput();
    const customEmojiKeys = new Set<NodeKey>();
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
          if (dom?.dataset.customEmoji !== undefined) {
            customEmojiKeys.add(nodeKey);
            continue;
          }
          customEmojiKeys.delete(nodeKey);
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
      registerEmojiNavigation(editor),
      // Show the current image of each custom emoji when the set changes
      effect(() => {
        const byName = customEmojiByName.value;
        for (const nodeKey of customEmojiKeys) {
          const dom = editor.getElementByKey(nodeKey);
          const name = dom?.dataset.customEmoji;
          if (dom && name !== undefined) {
            renderCustomEmoji(dom, name, byName.get(name));
          }
        }
      }),
    );
    // Defer loading of the transform which needs to load the emoji JSON.
    // The editor may be disposed before it arrives, so check the abort
    // signal, which is aborted when this registration is cleaned up.
    const abortSignal = state.getSignal();
    resolve(
      loadTextNodeTransform(),
      createTextNodeTransform => {
        if (abortSignal.aborted) {
          return;
        }
        abortSignal.addEventListener(
          'abort',
          // Registered only while the editor is editable, and again when the
          // custom emoji change, which runs it over all of the text
          effect(() =>
            editable.value
              ? editor.registerNodeTransform(
                  TextNode,
                  createTextNodeTransform(
                    config.parseEmojiReplacementEntry,
                    customEmojiByName.value,
                  ),
                )
              : undefined,
          ),
          {once: true},
        );
      },
      error => {
        if (!abortSignal.aborted) {
          editor._onError(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      },
    );
    return cleanup;
  },
});
