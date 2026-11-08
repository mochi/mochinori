import type {SplitEmojiTextOptions} from './$splitEmojiText.ts';
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

/**
 * The release of [jdecked/twemoji](https://github.com/jdecked/twemoji), the
 * maintained Twemoji, that the `twitter` set's images come from
 */
export const TWEMOJI_VERSION = '17.0.3';

/**
 * The newest Emoji version that the images of {@link TWEMOJI_VERSION}
 * cover. Newer emoji show in the font until Twemoji draws them.
 */
export const TWEMOJI_EMOJI_VERSION = 17;

/**
 * The Google Fonts stylesheet of the Noto Color Emoji font, which the
 * `google` set draws with. Google Fonts splits the font by Unicode range,
 * so a page downloads only the parts with the emoji it shows.
 */
export const NOTO_COLOR_EMOJI_STYLESHEET =
  'https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=swap';

/**
 * The emoji sets, both openly licensed and kept up to date:
 *
 * - `twitter`: Twemoji images from jdecked/twemoji ({@link TWEMOJI_VERSION})
 *   on jsDelivr, CC BY 4.0, which needs a credit such as "Emoji graphics by
 *   Twemoji, CC BY 4.0". Discord uses it.
 * - `google`: the Noto Color Emoji font from Google Fonts
 *   ({@link NOTO_COLOR_EMOJI_STYLESHEET}), SIL Open Font License, which
 *   Google updates for each Unicode release.
 *
 * Apple's set isn't licensed for commercial use, and Facebook's has no clear
 * license and stopped at Unicode 15.
 */
export const EMOJI_SETS = ['twitter', 'google'] as const;

/** One of {@link EMOJI_SETS} */
export type EmojiSet = (typeof EMOJI_SETS)[number];

/**
 * Where the images of an emoji set are: Twemoji's 72×72 PNGs on jsDelivr
 * for `twitter`, or `''` for `google`, which draws with a font
 */
export function emojiSetBaseUrl(set: EmojiSet): string {
  return set === 'twitter'
    ? `https://cdn.jsdelivr.net/gh/jdecked/twemoji@${TWEMOJI_VERSION}/assets/72x72`
    : '';
}

/**
 * The name of an emoji's Twemoji image, without `.png`, as Twemoji's own
 * parser spells it: its code points in lowercase hexadecimal without
 * leading zeros, joined by `-`, leaving out variation selectors unless it
 * has a zero width joiner, such as `1f44d-1f3fc` for 👍🏼, `2764` for ❤️ and
 * `23-20e3` for #️⃣
 */
export function twemojiID(emoji: string): string {
  // The one image that leaves them out despite a zero width joiner
  if (emoji === '\u{1F441}\uFE0F\u200D\u{1F5E8}\uFE0F') {
    return '1f441-200d-1f5e8';
  }
  const text = emoji.includes('\u200D')
    ? emoji
    : emoji.replaceAll('\uFE0F', '');
  return Array.from(text, c => c.codePointAt(0)!.toString(16)).join('-');
}

export interface EmojiExtensionConfig {
  /**
   * Which emoji set to draw with (see {@link EMOJI_SETS}), unless
   * {@link emojiBaseUrl} is set: the initial value of the `emojiSet` output
   * signal. Default: `'twitter'` (Twemoji, CC BY 4.0, so credit
   * it).
   */
  emojiSet: EmojiSet;
  /**
   * The base URL of the emoji PNG files, to serve them yourself: a copy of
   * `assets/72x72` from jdecked/twemoji at {@link TWEMOJI_VERSION}, or other
   * images named the same way ({@link twemojiID}, such as `1f642.png`) that
   * cover Emoji {@link TWEMOJI_EMOJI_VERSION}. It replaces
   * {@link emojiSet}. Do not add a trailing slash.
   *
   * Default: `''`, the {@link emojiSet}.
   */
  emojiBaseUrl: string;
  /**
   * The CSS `font-family` of the emoji that have no image: all of them with
   * the `google` set, and those newer than Twemoji's images with the
   * `twitter` set. `''` leaves them in the platform's font.
   *
   * Default: `"Noto Color Emoji"`.
   */
  emojiFontFamily: string;
  /**
   * The stylesheet that loads {@link emojiFontFamily}, added to the
   * editor's document when an emoji is drawn with it (or the `google` set
   * is chosen). Set it to `''` to load the font yourself, such as from the
   * `@fontsource/noto-color-emoji` package.
   *
   * Default: {@link NOTO_COLOR_EMOJI_STYLESHEET}.
   */
  emojiFontStylesheet: string;
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
  /**
   * Whether Unicode emoji typed or pasted into the editor, such as 👍 from
   * the system's emoji picker, turn into emoji nodes drawn with the same
   * images as the rest, as Slack and Discord do, and whether Markdown
   * import (`EmojiMdastExtension`) does the same. Otherwise they stay text
   * in the font. Only emoji in the database convert, and typed and pasted
   * ones only while the editor is editable. This is the initial value of the
   * `convertUnicodeEmoji` output signal. Default: true.
   */
  convertUnicodeEmoji: boolean;
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
  /**
   * Whether typed and pasted Unicode emoji turn into emoji nodes (see
   * {@link EmojiExtensionConfig.convertUnicodeEmoji}). Setting it to true
   * converts the ones already in the document; setting it to false leaves
   * the emoji nodes there as they are.
   */
  convertUnicodeEmoji: Signal<boolean>;
  /**
   * The shortcode of a Unicode emoji of the database, such as `:+1:` for 👍
   * and `:+1::skin-tone-3:` for 👍🏼, or null for one that isn't in it.
   * It is null until the emoji database has loaded.
   */
  getEmojiShortcode: (emoji: string) => string | null;
  /**
   * The emoji set to draw with. Set it to switch sets while the editor
   * runs: the emoji in the document are redrawn, each keeping its current
   * image until the new one loads. It has no effect when
   * {@link EmojiExtensionConfig.emojiBaseUrl} is set.
   */
  emojiSet: Signal<EmojiSet>;
  /**
   * Where the images of the current {@link emojiSet} are (or
   * {@link EmojiExtensionConfig.emojiBaseUrl}), or `''` when it draws with
   * a font. {@link getEmojiSrc} reads it, so a picker that draws with that
   * redraws when the set changes.
   */
  emojiBaseUrl: ReadonlySignal<string>;
  /**
   * {@link EmojiExtensionConfig.emojiFontFamily}: a picker draws an emoji
   * that has no image ({@link getEmojiSrc} is `''`) as text in this font.
   */
  emojiFontFamily: string;
  /**
   * The URL of the image of an emoji that {@link searchEmoji} found, or
   * `''` when it has none: the set draws with a font, or the emoji is newer
   * than the set's images. Draw those as text in {@link emojiFontFamily}.
   */
  getEmojiSrc: (suggestion: EmojiSuggestion) => string;
  /**
   * Splits a text node that isn't in the document yet, such as one an
   * import made, into text and emoji nodes: for each shortcode, custom
   * emoji `:name:` and Unicode emoji in it, or only the kinds that
   * `options` asks for. It returns the node as it is until the emoji
   * database has loaded. `EmojiMdastExtension` uses it for Markdown.
   */
  $createEmojiNodesFromText: (
    node: TextNode,
    options?: SplitEmojiTextOptions,
  ) => LexicalNode[];
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
 * The URL of a standard emoji's image in the images at `baseUrl`, or `''`
 * when there are none (a set that draws with a font) or the database says
 * the emoji is newer than they are
 */
function emojiImageSrc(
  baseUrl: string,
  emoji: string,
  database: EmojiDatabase | null,
): string {
  return !baseUrl ||
    !emoji ||
    (database?.lookUpEmoji(emoji)?.version ?? 0) > TWEMOJI_EMOJI_VERSION
    ? ''
    : `${baseUrl}/${twemojiID(emoji)}.png`;
}

/** Adds a stylesheet to a document, unless it already has it */
function addStylesheet(doc: Document, href: string) {
  for (const link of doc.querySelectorAll('link[rel="stylesheet"]')) {
    if (link.getAttribute('href') === href) {
      return;
    }
  }
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  doc.head.append(link);
}

/**
 * An extension to use the emojibase emoji database (Emoji 18, with Slack's
 * short names) to convert short names such as :man-facepalming: or :) to
 * their corresponding emoji, drawn with an {@link EmojiSet} rather than the
 * platform's font so that they look the same everywhere.
 *
 * Loading the emoji database is done using an async import so will typically
 * be a lazy loaded module in a separate chunk (Node loads it synchronously).
 * Shortcodes are only converted while the editor is editable.
 *
 * Images are also maximally lazily loaded, before they load the font's
 * representation of that emoji is used and then the emojiLoadedClass is
 * added. An emoji newer than the set's images stays in the font.
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
    const emojiSet = signal(config.emojiSet);
    const emojiBaseUrl = computed(
      () => config.emojiBaseUrl || emojiSetBaseUrl(emojiSet.value),
    );
    const customEmoji = signal(config.customEmoji);
    const skinTone = signal(config.skinTone);
    const convertUnicodeEmoji = signal(config.convertUnicodeEmoji);
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
      $createEmojiNodesFromText: (node, options) => {
        const split = splitter.peek();
        return split ? split(node, options) : [node];
      },
      convertUnicodeEmoji,
      customEmoji,
      customEmojiByName,
      emojiBaseUrl,
      emojiCategories: computed(
        () =>
          database.value?.getEmojiCategories({skinTone: skinTone.value}) ??
          null,
      ),
      emojiFontFamily: config.emojiFontFamily,
      emojiSet,
      getEmojiShortcode: emoji =>
        database.peek()?.lookUpEmoji(emoji)?.shortcode ?? null,
      getEmojiSrc: suggestion =>
        suggestion.custom
          ? suggestion.custom.src
          : emojiImageSrc(
              emojiBaseUrl.value,
              suggestion.emoji ?? '',
              database.peek(),
            ),
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
    convertUnicodeEmoji: true,
    customEmoji: [],
    customEmojiClass: 'mochinori-custom-emoji',
    customEmojiLookupMinLength: 2,
    emojiBaseUrl: '',
    emojiClass: 'mochinori-emoji',
    emojiFontFamily: '"Noto Color Emoji"',
    emojiFontStylesheet: NOTO_COLOR_EMOJI_STYLESHEET,
    emojiLoadedClass: 'mochinori-emoji--loaded',
    emojiLoadingClass: '',
    emojiSet: 'twitter',
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
    const {customEmoji, customEmojiByName, emojiBaseUrl} = output;
    // Draws an emoji as text in the emoji font, loading it if it isn't
    const showFont = (dom: HTMLElement) => {
      removeClassNamesFromElement(
        dom,
        config.emojiLoadedClass,
        config.emojiLoadingClass,
      );
      dom.style.backgroundImage = '';
      dom.style.fontFamily = config.emojiFontFamily;
      if (config.emojiFontFamily && config.emojiFontStylesheet) {
        addStylesheet(dom.ownerDocument, config.emojiFontStylesheet);
      }
    };
    const customEmojiKeys = new Set<NodeKey>();
    // The standard emoji drawn with an image, to redraw when the set changes
    const emojiKeys = new Set<NodeKey>();
    const nodeCleanup = new Map<NodeKey, () => void>();
    const runNodeCleanup = (nodeKey: NodeKey) => {
      const fn = nodeCleanup.get(nodeKey);
      if (fn) {
        nodeCleanup.delete(nodeKey);
        fn();
      }
    };
    // Draws a standard emoji with the current set: its image, or the emoji
    // font when it has none. Until the image loads, the platform's emoji
    // shows, or with `keepCurrent` the image it already has (when the set
    // changes).
    const showEmoji = (
      nodeKey: NodeKey,
      dom: HTMLElement,
      baseUrl: string,
      keepCurrent: boolean,
    ) => {
      runNodeCleanup(nodeKey);
      const imageUrl = emojiImageSrc(
        baseUrl,
        dom.textContent ?? '',
        loadedDatabases.get(output)?.peek() ?? null,
      );
      addClassNamesToElement(dom, config.emojiClass);
      Object.assign(dom.style, EMOJI_BOX_STYLE, {
        // The font's emoji, until the image loads, centered in the box
        lineHeight: '1.25em',
        textAlign: 'center',
        width: '1.25em',
      });
      if (!imageUrl) {
        showFont(dom);
        return;
      }
      // Only the platform's font until the image loads, so the emoji font
      // isn't downloaded for emoji that have images
      dom.style.fontFamily = '';
      const backgroundImage = `url(${imageUrl})`;
      if (!keepCurrent || !dom.style.backgroundImage) {
        removeClassNamesFromElement(dom, config.emojiLoadedClass);
        addClassNamesToElement(dom, config.emojiLoadingClass);
        dom.style.backgroundImage = backgroundImage;
      }
      const img = dom.ownerDocument.createElement('img');
      const cleanupImg = () => {
        img.onload = img.onerror = null;
      };
      const eagerNodeCleanup = () => {
        cleanupImg();
        nodeCleanup.delete(nodeKey);
        removeClassNamesFromElement(dom, config.emojiLoadingClass);
      };
      img.onerror = () => {
        eagerNodeCleanup();
        // The font's emoji, rather than another set's image
        showFont(dom);
      };
      img.onload = () => {
        eagerNodeCleanup();
        dom.style.backgroundImage = backgroundImage;
        addClassNamesToElement(dom, config.emojiLoadedClass);
      };
      nodeCleanup.set(nodeKey, cleanupImg);
      img.src = imageUrl;
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
          emojiKeys.delete(nodeKey);
          if (dom?.dataset.customEmoji !== undefined) {
            customEmojiKeys.add(nodeKey);
            continue;
          }
          customEmojiKeys.delete(nodeKey);
          if (!dom?.textContent) {
            continue;
          }
          emojiKeys.add(nodeKey);
          showEmoji(nodeKey, dom, emojiBaseUrl.peek(), false);
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
      // Redraw the standard emoji when the emoji set changes
      effect(() => {
        const baseUrl = emojiBaseUrl.value;
        for (const nodeKey of emojiKeys) {
          const dom = editor.getElementByKey(nodeKey);
          if (dom?.textContent) {
            showEmoji(nodeKey, dom, baseUrl, true);
          }
        }
      }),
      // Load the font of a set that draws every emoji with it, for pickers
      // too
      effect(() =>
        !emojiBaseUrl.value &&
        config.emojiFontFamily &&
        config.emojiFontStylesheet
          ? editor.registerRootListener(root => {
              if (root) {
                addStylesheet(root.ownerDocument, config.emojiFontStylesheet);
              }
            })
          : undefined,
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
          // custom emoji or convertUnicodeEmoji change, which runs it over
          // all of the text
          effect(() =>
            editable.value
              ? editor.registerNodeTransform(
                  TextNode,
                  createTextNodeTransform(
                    config.parseEmojiReplacementEntry,
                    customEmojiByName.value,
                    () => output.skinTone.peek(),
                    output.convertUnicodeEmoji.value,
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
