import type {EmojiSuggestion} from './searchEmoji.ts';

import {
  batch,
  computed,
  type ReadonlySignal,
  type Signal,
  signal,
  WatchEditableExtension,
} from '@lexical/extension';
import {
  $createTextNode,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  BLUR_COMMAND,
  COMMAND_PRIORITY_HIGH,
  defineExtension,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
  type LexicalEditor,
  mergeRegister,
  type NodeKey,
  safeCast,
} from 'lexical';

import {
  $createEmojiNodeFromSuggestion,
  EmojiExtension,
} from './EmojiExtension.ts';
import {$isEmojiNode} from './EmojiNode.ts';
import {NAME_BEFORE_CARET} from './typedName.ts';

export interface EmojiTypeaheadConfig {
  /**
   * How much of a name has to follow the `:` before suggestions show, like
   * the two characters Slack and Discord wait for. Default: 2.
   */
  minLength: number;
  /** The most suggestions to show. Default: 8. */
  limit: number;
}

/** A suggestion, with the URL of its image */
export interface EmojiTypeaheadSuggestion extends EmojiSuggestion {
  readonly src: string;
}

/** What an emoji typeahead menu shows while it is open */
export interface EmojiTypeaheadState {
  /** What was typed after the `:` */
  readonly query: string;
  /** The emoji matching it, best first; never empty */
  readonly suggestions: readonly EmojiTypeaheadSuggestion[];
  /** The suggestion that Enter or Tab picks */
  readonly selectedIndex: number;
  /**
   * Where the `:query` is on screen, to place the menu by, or null if it
   * isn't rendered
   */
  getRect: () => DOMRect | null;
}

export interface EmojiTypeaheadOutput {
  /**
   * The menu to show, or null when it is closed. Render it however the app
   * likes; the extension handles the keys.
   */
  state: ReadonlySignal<EmojiTypeaheadState | null>;
  /** Replaces the `:query` with a suggestion (the selected one by default) */
  select: (index?: number) => void;
  /** Highlights a suggestion, such as the one under the pointer */
  setSelectedIndex: (index: number) => void;
  /** Closes the menu until something else is typed */
  dismiss: () => void;
}

interface TypedQuery {
  readonly key: NodeKey;
  /** Offset of the `:` */
  readonly start: number;
  /** Offset of the caret */
  readonly end: number;
  readonly query: string;
}

/**
 * A headless emoji typeahead, like the menu Slack and Discord show while
 * `:app` is typed: its state is a signal for the app to render with React,
 * Svelte, plain DOM or anything else, and it handles the keys itself (Up and
 * Down to move, Enter or Tab to pick, Escape to close). Picking replaces the
 * `:query` with the emoji and a space. Suggestions include custom emoji, and
 * with {@link EmojiExtensionConfig.lookupCustomEmoji} the ones that a lookup
 * finds while the menu is open.
 */
export const EmojiTypeaheadExtension = defineExtension({
  build(editor, config, state): EmojiTypeaheadOutput {
    const editable = state.getDependency(WatchEditableExtension).output;
    const {getEmojiSrc, searchEmoji} =
      state.getDependency(EmojiExtension).output;
    const typed = signal<TypedQuery | null>(null);
    // The `:query` that Escape closed the menu for
    const dismissed = signal<string | null>(null);
    const selectedIndex = signal(0);
    const suggestions = computed<readonly EmojiTypeaheadSuggestion[]>(() => {
      const search = searchEmoji.value;
      const current = typed.value;
      if (!search || !current || !editable.value) {
        return [];
      }
      return search(current.query, {limit: config.limit}).map(suggestion => ({
        ...suggestion,
        src: getEmojiSrc(suggestion),
      }));
    });
    const typeaheadState = computed<EmojiTypeaheadState | null>(() => {
      const current = typed.value;
      const list = suggestions.value;
      if (
        current === null ||
        dismissed.value === dismissKey(current) ||
        list.length === 0
      ) {
        return null;
      }
      return {
        getRect: () => getQueryRect(editor, current),
        query: current.query,
        selectedIndex: Math.min(selectedIndex.value, list.length - 1),
        suggestions: list,
      };
    });
    const output: EmojiTypeaheadOutput = {
      dismiss: () => {
        const current = typed.peek();
        if (current) {
          dismissed.value = dismissKey(current);
        }
      },
      select: index => {
        const current = typeaheadState.peek();
        const at = typed.peek();
        const suggestion = current?.suggestions[index ?? current.selectedIndex];
        if (at && suggestion) {
          editor.update(() => $replaceQuery(at, suggestion));
        }
      },
      setSelectedIndex: index => {
        selectedIndex.value = index;
      },
      state: typeaheadState,
    };
    typeaheadInternals.set(output, {dismissed, selectedIndex, typed});
    return output;
  },
  config: safeCast<EmojiTypeaheadConfig>({limit: 8, minLength: 2}),
  dependencies: [EmojiExtension, WatchEditableExtension],
  name: '@mochinori/emoji/EmojiTypeahead',
  register(editor, config, state) {
    const output = state.getOutput();
    const internals = typeaheadInternals.get(output);
    if (!internals) {
      return () => {};
    }
    const {dismissed, selectedIndex, typed} = internals;
    const isOpen = () => output.state.peek() !== null;
    const ifOpen =
      (handler: (event: KeyboardEvent | null) => void) =>
      (event: KeyboardEvent | null) => {
        if (!isOpen()) {
          return false;
        }
        event?.preventDefault();
        event?.stopImmediatePropagation();
        handler(event);
        return true;
      };
    const move = (delta: number) => {
      const current = output.state.peek();
      if (current) {
        const count = current.suggestions.length;
        selectedIndex.value = (current.selectedIndex + delta + count) % count;
      }
    };
    return mergeRegister(
      editor.registerUpdateListener(({editorState}) => {
        const next = editorState.read(() =>
          editor.isEditable() && !editor.isComposing()
            ? $typedQuery(config.minLength)
            : null,
        );
        const prev = typed.peek();
        if (
          prev?.key === next?.key &&
          prev?.start === next?.start &&
          prev?.query === next?.query
        ) {
          return;
        }
        batch(() => {
          typed.value = next;
          selectedIndex.value = 0;
          // Escape closes the menu until something else is typed
          dismissed.value = null;
        });
      }),
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        ifOpen(() => move(1)),
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        ifOpen(() => move(-1)),
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        ifOpen(() => output.select()),
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_TAB_COMMAND,
        ifOpen(() => output.select()),
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        ifOpen(() => output.dismiss()),
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        BLUR_COMMAND,
        () => {
          output.dismiss();
          return false;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      // Closed once the extension is gone
      () => {
        typed.value = null;
      },
    );
  },
});

// The signals that register() updates, for each editor's output
const typeaheadInternals = new WeakMap<
  EmojiTypeaheadOutput,
  {
    dismissed: Signal<string | null>;
    selectedIndex: Signal<number>;
    typed: Signal<TypedQuery | null>;
  }
>();

/** Replaces the `:query` with the emoji and a space */
function $replaceQuery(typed: TypedQuery, suggestion: EmojiSuggestion) {
  const node = $getNodeByKey(typed.key);
  if (
    !$isTextNode(node) ||
    node.getTextContent().slice(typed.start, typed.end) !== `:${typed.query}`
  ) {
    return;
  }
  const [target] =
    typed.start === 0
      ? node.splitText(typed.end)
      : node.splitText(typed.start, typed.end).slice(1);
  if (!target) {
    return;
  }
  const emojiNode = $createEmojiNodeFromSuggestion(suggestion)
    .setFormat(target.getFormat())
    .setStyle(target.getStyle());
  target.replace(emojiNode);
  const space = $createTextNode(' ')
    .setFormat(emojiNode.getFormat())
    .setStyle(emojiNode.getStyle());
  emojiNode.insertAfter(space);
  space.select(1, 1);
}

function dismissKey(typed: TypedQuery): string {
  return `${typed.key}:${typed.start}`;
}

/** The `:name` being typed before a collapsed selection, if any */
function $typedQuery(minLength: number): TypedQuery | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return null;
  }
  const {anchor} = selection;
  const node = anchor.getNode();
  if (
    !$isTextNode(node) ||
    $isEmojiNode(node) ||
    !node.isSimpleText() ||
    node.hasFormat('code')
  ) {
    return null;
  }
  const before = node.getTextContent().slice(0, anchor.offset);
  const match = NAME_BEFORE_CARET.exec(before);
  if (!match || match[1].length < minLength) {
    return null;
  }
  const query = match[1];
  return {
    end: anchor.offset,
    key: node.getKey(),
    query,
    start: anchor.offset - query.length - 1,
  };
}

/** Where `:query` is on screen */
function getQueryRect(
  editor: LexicalEditor,
  typed: TypedQuery,
): DOMRect | null {
  const element = editor.getElementByKey(typed.key);
  if (!element) {
    return null;
  }
  const walker = element.ownerDocument.createTreeWalker(element, 4);
  const text = walker.nextNode();
  if (!text || (text.textContent ?? '').length < typed.end) {
    return element.getBoundingClientRect();
  }
  const range = element.ownerDocument.createRange();
  range.setStart(text, typed.start);
  range.setEnd(text, typed.end);
  return range.getBoundingClientRect();
}
