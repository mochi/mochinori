import type {CustomEmoji, CustomEmojiMap} from './customEmoji.ts';

import {
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  type LexicalEditor,
  type LexicalNode,
} from 'lexical';

import {$isCustomEmojiNode} from './EmojiNode.ts';
import {NAME_BEFORE_CARET} from './typedName.ts';

/**
 * Finds custom emoji, by name or by the start of a name, for
 * {@link EmojiExtensionConfig.lookupCustomEmoji}
 */
export type CustomEmojiLookup = (
  query: string,
  abortSignal: AbortSignal,
) => Promise<readonly CustomEmoji[]>;

export interface CustomEmojiLookupOptions {
  lookup: CustomEmojiLookup;
  /** The shortest typed name (after the `:`) to look up */
  minLength: number;
  /** The current custom emoji by name */
  getCustomEmoji: () => CustomEmojiMap;
  /** Adds what a lookup found */
  addCustomEmoji: (found: readonly CustomEmoji[]) => void;
  /** Aborted when the editor is disposed */
  abortSignal: AbortSignal;
  reportError: (error: unknown) => void;
}

// A `:name:` in text; names have no spaces or colons
const NAME_IN_TEXT = /:([^\s:]+):/g;

/**
 * Looks up custom emoji as they are needed, rather than loading the whole
 * set up front: the start of a name as it is typed (once it is `minLength`
 * long), so the emoji is usually there by the time the closing `:` is, and
 * each `:name:` or custom emoji in the document whose name isn't known yet.
 * Each query is asked once per editor.
 */
export function registerCustomEmojiLookup(
  editor: LexicalEditor,
  options: CustomEmojiLookupOptions,
): () => void {
  const {abortSignal, lookup, minLength} = options;
  const asked = new Set<string>();
  const query = (q: string) => {
    if (asked.has(q) || abortSignal.aborted) {
      return;
    }
    asked.add(q);
    lookup(q, abortSignal).then(found => {
      if (!abortSignal.aborted && found.length > 0) {
        options.addCustomEmoji(found);
      }
    }, options.reportError);
  };
  // Names in the document that aren't known yet
  const $collectNames = (nodes: Iterable<LexicalNode>, names: Set<string>) => {
    for (const node of nodes) {
      if ($isCustomEmojiNode(node)) {
        const name = node.getName();
        if (name) {
          names.add(name);
        }
      } else if ($isTextNode(node)) {
        for (const [, name] of node.getTextContent().matchAll(NAME_IN_TEXT)) {
          names.add(name);
        }
      }
    }
  };
  const queryNames = (names: Set<string>) => {
    const known = options.getCustomEmoji();
    for (const name of names) {
      if (!known.has(name)) {
        query(name);
      }
    }
  };
  const $allTextNodes = () => $getRoot().getAllTextNodes();
  const initial = new Set<string>();
  editor.getEditorState().read(() => $collectNames($allTextNodes(), initial));
  queryNames(initial);
  return editor.registerUpdateListener(
    ({dirtyElements, dirtyLeaves, editorState}) => {
      if (dirtyLeaves.size === 0 && dirtyElements.size === 0) {
        // Only the selection changed; what's typed is unchanged too
        return;
      }
      const names = new Set<string>();
      let typed: string | undefined;
      editorState.read(() => {
        // A new editor state (setEditorState) dirties no leaves, so it is
        // scanned whole
        $collectNames(
          dirtyLeaves.size === 0
            ? $allTextNodes()
            : Array.from(dirtyLeaves, key => $getNodeByKey(key)).filter(
                node => node !== null,
              ),
          names,
        );
        typed = editor.isEditable() ? $typedName() : undefined;
      });
      queryNames(names);
      if (typed !== undefined && typed.length >= minLength) {
        query(typed);
      }
    },
  );
}

/** The name being typed before a collapsed selection, if any */
function $typedName(): string | undefined {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return undefined;
  }
  const {anchor} = selection;
  const node = anchor.getNode();
  if (!$isTextNode(node) || $isCustomEmojiNode(node)) {
    return undefined;
  }
  return NAME_BEFORE_CARET.exec(
    node.getTextContent().slice(0, anchor.offset),
  )?.[1];
}
