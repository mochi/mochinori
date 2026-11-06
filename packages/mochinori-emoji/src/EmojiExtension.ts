import type {CustomEmoji, CustomEmojiMap} from './customEmoji.ts';
import type {
  EmojiCategory,
  EmojiSuggestion,
  SearchEmojiOptions,
} from './searchEmoji.ts';
import type {SkinTone} from './skinToneNames.ts';

import {
  computed,
  effect,
  type ReadonlySignal,
  type Signal,
  signal,
  WatchEditableExtension,
} from '@lexical/extension';
import {CoreImportExtension, DOMImportExtension} from '@lexical/html';
import {
  $getSelection,
  $isRangeSelection,
  addClassNamesToElement,
  COMMAND_PRIORITY_EDITOR,
  configExtension,
  createCommand,
  defineExtension,
  type LexicalEditor,
  type LexicalNode,
  mergeRegister,
  type NodeKey,
  removeClassNamesFromElement,
  safeCast,
  TextNode,
} from 'lexical';

import {loadEmojiDatabase} from '#loadEmojiDatabase';

import {
  type EmojiEntryParser,
  parseEmojiShortNamesAndTexts,
} from './emojiEntries.ts';
import {EmojiImportRules} from './EmojiImportRules.ts';
import {
  $createCustomEmojiNode,
  $createEmojiNode,
  EMOJI_BOX_STYLE,
  EmojiNode,
  renderCustomEmoji,
} from './EmojiNode.ts';
import {
  type CustomEmojiLookup,
  registerCustomEmojiLookup,
} from './registerCustomEmojiLookup.ts';
import {registerEmojiNavigation} from './registerEmojiNavigation.ts';
import {skinToneShortcode} from './skinToneNames.ts';
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
   * The class to use for emoji nodes. The image's size and position are
   * inline styles (1.25em square, sitting on the baseline like a glyph), so
   * this is for anything else.
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
   * Loads custom emoji when an editor is created, such as with a `fetch` of
   * the app's emoji list, so they don't have to be known when the editor is
   * configured. The result is added to `customEmoji` (replacing any with the
   * same name), and shortcodes typed while it loads convert once it arrives.
   * `abortSignal` is aborted when the editor is disposed; a rejection goes
   * to the editor's `onError`.
   */
  loadCustomEmoji:
    ((abortSignal: AbortSignal) => Promise<readonly CustomEmoji[]>) | undefined;
  /**
   * Looks up custom emoji as they are needed instead of loading the whole
   * set, like Slack does for a workspace with thousands of them. It is asked
   * for `query`, the start of a name, as the name is typed (once it is
   * {@link customEmojiLookupMinLength} long), and for each `:name:` or custom
   * emoji in the document whose name isn't known yet. Return the custom
   * emoji whose names start with `query` (a few is enough); they are added
   * to `customEmoji`. Each query is asked once per editor. `abortSignal` is
   * aborted when the editor is disposed; a rejection goes to the editor's
   * `onError`.
   */
  lookupCustomEmoji: CustomEmojiLookup | undefined;
  /**
   * How much of a name has to be typed after the `:` before
   * {@link lookupCustomEmoji} is asked. Default: 2.
   */
  customEmojiLookupMinLength: number;
  /**
   * The class to use for custom emoji. The image is the element's background
   * and its `:name:` text is shrunk to nothing; a name that is not in
   * `customEmoji` shows its text instead.
   */
  customEmojiClass: string;
  /**
   * The skin tone that emoji typed by short name (`:+1:`) and the
   * suggestions and picker get, like the one Slack and Discord let people
   * choose: the initial value of the `skinTone` output signal. Default: 1,
   * no skin tone.
   */
  skinTone: SkinTone;
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
  /**
   * Searches the standard and custom emoji by short name (see
   * {@link searchEmoji}), for an emoji picker. It is null until the emoji
   * database has loaded, and changes when the custom emoji do, so a picker
   * that reads it searches again then.
   */
  searchEmoji: ReadonlySignal<SearchEmoji | null>;
  /**
   * The emoji of the database by category, in the order pickers show them,
   * with the current skin tone, for a picker's tabs. It is null until the
   * emoji database has loaded.
   */
  emojiCategories: ReadonlySignal<readonly EmojiCategory[] | null>;
  /**
   * The skin tone that typed short names, {@link searchEmoji} and
   * {@link emojiCategories} use. Set it when the person picks one; emoji
   * already in the document keep theirs.
   */
  skinTone: Signal<SkinTone>;
  /** The URL of the image of an emoji that {@link searchEmoji} found */
  getEmojiSrc: (suggestion: EmojiSuggestion) => string;
  /**
   * Splits a text node that isn't in the document yet, such as one an
   * import made, into text and emoji nodes: for each shortcode, custom
   * emoji `:name:` and Unicode emoji in it. It returns the node as it is
   * until the emoji database has loaded. `EmojiMdastExtension` uses it for
   * Markdown.
   */
  $createEmojiNodesFromText: (node: TextNode) => LexicalNode[];
}

/** {@link searchEmoji} over the standard and custom emoji of an editor */
export type SearchEmoji = (
  query: string,
  options?: Omit<SearchEmojiOptions, 'customEmoji' | 'skinTone'>,
) => EmojiSuggestion[];

type EmojiDatabase = typeof import('./emojiDatabase.ts');

// The database once register() has loaded it, for each editor's output
const loadedDatabases = new WeakMap<
  EmojiExtensionOutput,
  Signal<EmojiDatabase | null>
>();

function resolve<T>(
  arg: Promise<T> | T,
  fn: (v: T) => void,
  onError: (error: unknown) => void,
) {
  if (arg instanceof Promise) {
    arg.then(fn, onError);
  } else {
    fn(arg);
  }
}

/**
 * Inserts an emoji, such as one picked from an emoji picker, at the
 * selection: a {@link EmojiSuggestion} from
 * {@link EmojiExtensionOutput.searchEmoji}.
 */
export const INSERT_EMOJI_COMMAND = createCommand<EmojiSuggestion>(
  'INSERT_EMOJI_COMMAND',
);

/** A new node for an emoji that {@link searchEmoji} found */
export function $createEmojiNodeFromSuggestion(
  suggestion: EmojiSuggestion,
): EmojiNode {
  return suggestion.custom
    ? $createCustomEmojiNode(suggestion.custom.name)
    : $createEmojiNode(
        suggestion.emoji ?? '',
        `:${suggestion.name}:${skinToneShortcode(suggestion.skinTone ?? 1)}`,
      );
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
 *
 * It also adds {@link EmojiImportRules} to `DOMImportExtension`, so HTML
 * imported through that pipeline (`ClipboardDOMImportExtension` for paste,
 * or `$generateNodesFromDOM`) turns the emoji that {@link EmojiNode}
 * exports back into emoji. Emoji have no legacy `importDOM`.
 */
export const EmojiExtension = defineExtension({
  build(_editor, config): EmojiExtensionOutput {
    const customEmoji = signal(config.customEmoji);
    const skinTone = signal(config.skinTone);
    const customEmojiByName = computed<CustomEmojiMap>(
      () => new Map(customEmoji.value.map(emoji => [emoji.name, emoji])),
    );
    const database = signal<EmojiDatabase | null>(null);
    // Splits text for the current custom emoji, once the database loads
    const splitter = computed(() =>
      database.value?.createEmojiTextSplitter(
        config.parseEmojiReplacementEntry,
        customEmojiByName.value,
      ),
    );
    const output: EmojiExtensionOutput = {
      $createEmojiNodesFromText: node => {
        const split = splitter.peek();
        return split ? split(node) : [node];
      },
      customEmoji,
      customEmojiByName,
      emojiCategories: computed(
        () =>
          database.value?.getEmojiCategories({skinTone: skinTone.value}) ??
          null,
      ),
      getEmojiSrc: suggestion =>
        suggestion.custom
          ? suggestion.custom.src
          : `${config.emojiBaseUrl}/${unifiedIDFromText(suggestion.emoji ?? '')}.png`,
      searchEmoji: computed(() => {
        const db = database.value;
        const custom = customEmoji.value;
        const tone = skinTone.value;
        return db
          ? (query, options) =>
              db.searchEmoji(query, {
                ...options,
                customEmoji: custom,
                skinTone: tone,
              })
          : null;
      }),
      skinTone,
    };
    loadedDatabases.set(output, database);
    return output;
  },
  config: safeCast<EmojiExtensionConfig>({
    customEmoji: [],
    customEmojiClass: 'mochinori-custom-emoji',
    customEmojiLookupMinLength: 2,
    emojiBaseUrl: `https://cdn.jsdelivr.net/npm/emoji-datasource-facebook@${EMOJI_DATASOURCE_VERSION}/img/facebook/64`,
    emojiClass: 'mochinori-emoji',
    emojiLoadedClass: 'mochinori-emoji--loaded',
    emojiLoadingClass: '',
    loadCustomEmoji: undefined,
    lookupCustomEmoji: undefined,
    parseEmojiReplacementEntry: parseEmojiShortNamesAndTexts,
    skinTone: 1,
  }),
  dependencies: [
    WatchEditableExtension,
    CoreImportExtension,
    configExtension(DOMImportExtension, {rules: EmojiImportRules}),
  ],
  name: '@mochinori/emoji/Emoji',
  nodes: () => [EmojiNode],
  register(editor: LexicalEditor, config, state) {
    const editable = state.getDependency(WatchEditableExtension).output;
    const output = state.getOutput();
    const {customEmoji, customEmojiByName} = output;
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
          Object.assign(dom.style, EMOJI_BOX_STYLE, {
            backgroundImage: `url(${imageUrl})`,
            // The font's emoji, until the image loads, centered in the box
            lineHeight: '1.25em',
            textAlign: 'center',
            width: '1.25em',
          });
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
      editor.registerCommand(
        INSERT_EMOJI_COMMAND,
        suggestion => {
          const selection = $getSelection();
          if (!editor.isEditable() || !$isRangeSelection(selection)) {
            return false;
          }
          const node = $createEmojiNodeFromSuggestion(suggestion)
            .setFormat(selection.format)
            .setStyle(selection.style);
          selection.insertNodes([node]);
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
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
    const reportError = (error: unknown) => {
      if (!abortSignal.aborted) {
        editor._onError(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    };
    // Adds custom emoji, replacing any with the same name
    const addCustomEmoji = (found: readonly CustomEmoji[]) => {
      const names = new Set(found.map(emoji => emoji.name));
      customEmoji.value = [
        ...customEmoji.value.filter(emoji => !names.has(emoji.name)),
        ...found,
      ];
    };
    if (config.loadCustomEmoji) {
      config.loadCustomEmoji(abortSignal).then(loaded => {
        if (!abortSignal.aborted) {
          addCustomEmoji(loaded);
        }
      }, reportError);
    }
    if (config.lookupCustomEmoji) {
      abortSignal.addEventListener(
        'abort',
        registerCustomEmojiLookup(editor, {
          abortSignal,
          addCustomEmoji,
          getCustomEmoji: () => customEmojiByName.peek(),
          lookup: config.lookupCustomEmoji,
          minLength: config.customEmojiLookupMinLength,
          reportError,
        }),
        {once: true},
      );
    }
    resolve(
      loadEmojiDatabase(),
      db => {
        if (abortSignal.aborted) {
          return;
        }
        const {createTextNodeTransform} = db;
        const loaded = loadedDatabases.get(output);
        if (loaded) {
          loaded.value = db;
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
                    () => output.skinTone.peek(),
                  ),
                )
              : undefined,
          ),
          {once: true},
        );
      },
      reportError,
    );
    return cleanup;
  },
});
