import {
  $getNearestNodeFromDOMNode,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  getComposedEventTarget,
  isHTMLElement,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  type LexicalEditor,
  mergeRegister,
  type PointType,
  SELECTION_CHANGE_COMMAND,
} from 'lexical';

import {$isEmojiNode, type EmojiNode} from './EmojiNode.ts';

/**
 * The emoji that moving the caret from `point` (backward or forward) would
 * cross, when the point is inside one or at the edge of one
 */
function $emojiAcross(point: PointType, isBackward: boolean): EmojiNode | null {
  if (point.type !== 'text') {
    return null;
  }
  const node = point.getNode();
  if (!$isTextNode(node)) {
    return null;
  }
  if (
    $isEmojiNode(node) &&
    (isBackward ? point.offset > 0 : point.offset < node.getTextContentSize())
  ) {
    return node;
  }
  const atEdge = isBackward
    ? point.offset === 0
    : point.offset === node.getTextContentSize();
  if (atEdge) {
    const sibling = isBackward
      ? node.getPreviousSibling()
      : node.getNextSibling();
    return $isEmojiNode(sibling) ? sibling : null;
  }
  return null;
}

/** Puts `point` on the far side of `emoji` */
function $setPointPast(
  point: PointType,
  emoji: EmojiNode,
  isBackward: boolean,
): void {
  // On the neighbor's edge when there is one, so the caret is never in the
  // emoji's own text, which a custom emoji hides
  const sibling = isBackward
    ? emoji.getPreviousSibling()
    : emoji.getNextSibling();
  if ($isTextNode(sibling) && !$isEmojiNode(sibling)) {
    point.set(
      sibling.getKey(),
      isBackward ? sibling.getTextContentSize() : 0,
      'text',
    );
  } else {
    point.set(
      emoji.getKey(),
      isBackward ? 0 : emoji.getTextContentSize(),
      'text',
    );
  }
}

function $moveAcrossEmoji(event: KeyboardEvent, isBackward: boolean): boolean {
  const selection = $getSelection();
  if (
    !$isRangeSelection(selection) ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    (!event.shiftKey && !selection.isCollapsed())
  ) {
    return false;
  }
  const emoji = $emojiAcross(selection.focus, isBackward);
  if (!emoji) {
    return false;
  }
  event.preventDefault();
  $setPointPast(selection.focus, emoji, isBackward);
  if (!event.shiftKey) {
    selection.anchor.set(
      selection.focus.key,
      selection.focus.offset,
      selection.focus.type,
    );
  }
  selection.dirty = true;
  return true;
}

/**
 * Makes each emoji one caret position: the left and right arrow keys cross
 * it in one step (Shift extends the selection over it), a click on it puts
 * the caret on the side that was clicked, and a caret that lands inside its
 * text moves to the nearer edge. The browser alone would step through the
 * hidden text of a custom emoji one character at a time.
 */
export function registerEmojiNavigation(editor: LexicalEditor): () => void {
  return mergeRegister(
    editor.registerCommand(
      KEY_ARROW_LEFT_COMMAND,
      event => $moveAcrossEmoji(event, true),
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      KEY_ARROW_RIGHT_COMMAND,
      event => $moveAcrossEmoji(event, false),
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      CLICK_COMMAND,
      event => {
        const target = getComposedEventTarget(event);
        const element = isHTMLElement(target)
          ? target.closest('[data-custom-emoji]')
          : null;
        const node = element ? $getNearestNodeFromDOMNode(element) : null;
        if (!element || !$isEmojiNode(node)) {
          return false;
        }
        const rect = element.getBoundingClientRect();
        const atEnd = event.clientX >= rect.left + rect.width / 2;
        const offset = atEnd ? node.getTextContentSize() : 0;
        node.select(offset, offset);
        return true;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          return false;
        }
        const {focus} = selection;
        const node = focus.getNode();
        if (
          focus.type === 'text' &&
          $isEmojiNode(node) &&
          focus.offset > 0 &&
          focus.offset < node.getTextContentSize()
        ) {
          const offset =
            focus.offset * 2 >= node.getTextContentSize()
              ? node.getTextContentSize()
              : 0;
          node.select(offset, offset);
        }
        return false;
      },
      COMMAND_PRIORITY_LOW,
    ),
  );
}
