import {
  $createRangeSelection,
  $createRangeSelectionFromDom,
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $getSelection,
  $getSlotFrame,
  $getSlotHost,
  $insertNodes,
  $isElementNode,
  $isNodeSelection,
  $isRangeSelection,
  $isTextNode,
  $normalizeSelection__EXPERIMENTAL,
  $setSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  DRAGOVER_COMMAND,
  DRAGSTART_COMMAND,
  DROP_COMMAND,
  getDOMSelection,
  isHTMLElement,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_ESCAPE_COMMAND,
  type LexicalEditor,
  type LexicalNode,
  mergeRegister,
  type RangeSelection,
} from 'lexical';

import {$selectImage} from './ImageCaption.ts';
import {$isImageNode, type ImageNode} from './ImageNode.tsx';

/**
 * The drag data type of an image dragged within an editor. Its value is
 * `{"editorKey": ..., "nodeKey": ...}` as JSON.
 */
export const IMAGE_DRAG_TYPE = 'application/x-mochinori-image';

interface ImageDragData {
  editorKey: string;
  nodeKey: string;
}

/**
 * The image a pointer event targets, or null when it targets something else,
 * including the image's caption (where the caret must go into the text) and
 * its buttons.
 */
function $getImageFromTarget(
  editor: LexicalEditor,
  target: EventTarget | null,
): ImageNode | null {
  if (!isHTMLElement(target) || target.closest('button') !== null) {
    return null;
  }
  const node = $getNearestNodeFromDOMNode(target);
  if (!$isImageNode(node)) {
    return null;
  }
  const dom = editor.getElementByKey(node.getKey());
  const slot = target.closest('[data-lexical-slot]');
  if (dom === null || (slot !== null && dom.contains(slot))) {
    return null;
  }
  return node;
}

/** The image whose caption contains `node`, if any */
function $getCaptionImage(node: LexicalNode): ImageNode | null {
  const frame = $getSlotFrame(node);
  const host = frame && $getSlotHost(frame);
  return $isImageNode(host) ? host : null;
}

/**
 * A click in the caption of a selected image puts the caret in the caption.
 * Rich text keeps the image selected on a click inside it, which would
 * leave the caret in the caption while the image stays selected.
 */
function $enterCaption(editor: LexicalEditor, event: MouseEvent): boolean {
  const selection = $getSelection();
  const target = event.target;
  if (!$isNodeSelection(selection) || !isHTMLElement(target)) {
    return false;
  }
  const node = $getNearestNodeFromDOMNode(target);
  if (node === null || $getCaptionImage(node) === null) {
    return false;
  }
  const doc = editor.getRootElement()?.ownerDocument;
  const range = $createRangeSelectionFromDom(
    getDOMSelection(doc?.defaultView ?? null),
    editor,
  );
  if (range === null) {
    return false;
  }
  $setSelection(range);
  return true;
}

/**
 * Clicking an image selects it; shift-clicking adds it to (or removes it
 * from) the selected nodes.
 */
function registerImageClick(editor: LexicalEditor): () => void {
  return editor.registerCommand(
    CLICK_COMMAND,
    event => {
      if (!editor.isEditable()) {
        return false;
      }
      const image = $getImageFromTarget(editor, event.target);
      if (image === null) {
        return $enterCaption(editor, event);
      }
      const selection = $getSelection();
      const key = image.getKey();
      if (event.shiftKey && $isNodeSelection(selection)) {
        if (selection.has(key)) {
          selection.delete(key);
        } else {
          selection.add(key);
        }
      } else {
        $selectImage(key);
      }
      return true;
    },
    COMMAND_PRIORITY_LOW,
  );
}

/**
 * Keys inside a caption: Escape selects the image, Backspace in an empty
 * caption removes it, and the arrow keys leave the caption at its edges.
 */
function registerCaptionKeys(editor: LexicalEditor): () => void {
  const $captionSelection = (): [RangeSelection, ImageNode] | null => {
    const selection = $getSelection();
    if (
      !editor.isEditable() ||
      !$isRangeSelection(selection) ||
      !selection.isCollapsed()
    ) {
      return null;
    }
    const image = $getCaptionImage(selection.anchor.getNode());
    return image && [selection, image];
  };
  const $atCaptionEdge = (
    selection: RangeSelection,
    image: ImageNode,
    edge: 'start' | 'end',
  ): boolean => {
    const caption = image.getCaption();
    if (!$isElementNode(caption)) {
      return false;
    }
    const point = selection.anchor;
    const boundary =
      edge === 'start'
        ? caption.getFirstDescendant()
        : caption.getLastDescendant();
    if (boundary === null) {
      return true;
    }
    if (point.type === 'element') {
      return point.getNode().is(caption)
        ? point.offset === (edge === 'start' ? 0 : caption.getChildrenSize())
        : false;
    }
    return (
      point.getNode().is(boundary) &&
      point.offset === (edge === 'start' ? 0 : boundary.getTextContentSize())
    );
  };
  const leave = (edge: 'start' | 'end') => (event: KeyboardEvent | null) => {
    const found = $captionSelection();
    if (found === null || !$atCaptionEdge(found[0], found[1], edge)) {
      return false;
    }
    event?.preventDefault();
    if (edge === 'start') {
      found[1].selectPrevious();
    } else {
      found[1].selectNext(0, 0);
    }
    return true;
  };
  return mergeRegister(
    editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      () => {
        const found = $captionSelection();
        if (found === null) {
          return false;
        }
        $selectImage(found[1].getKey());
        return true;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      event => {
        const found = $captionSelection();
        if (found === null || found[1].getCaption()?.getTextContentSize()) {
          return false;
        }
        event.preventDefault();
        found[1].setCaption(null);
        $selectImage(found[1].getKey());
        return true;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      leave('start'),
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      KEY_ARROW_LEFT_COMMAND,
      leave('start'),
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      leave('end'),
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      KEY_ARROW_RIGHT_COMMAND,
      leave('end'),
      COMMAND_PRIORITY_LOW,
    ),
  );
}

interface CaretPoint {
  node: Node;
  offset: number;
}

/** The caret position under a point, in the document of `editor` */
function caretFromPoint(
  editor: LexicalEditor,
  x: number,
  y: number,
): CaretPoint | null {
  const doc = editor.getRootElement()?.ownerDocument;
  if (!doc) {
    return null;
  }
  if (typeof doc.caretPositionFromPoint === 'function') {
    const position = doc.caretPositionFromPoint(x, y);
    return position && {node: position.offsetNode, offset: position.offset};
  }
  // Safari before 18.2
  if (typeof doc.caretRangeFromPoint === 'function') {
    const range = doc.caretRangeFromPoint(x, y);
    return range && {node: range.startContainer, offset: range.startOffset};
  }
  return null;
}

/**
 * Where an image dropped at `point` goes, or null when it can't go there:
 * outside the editor, onto itself, or into an image's caption.
 */
function $dropSelection(
  point: CaretPoint,
  image: ImageNode,
): RangeSelection | null {
  const target = $getNearestNodeFromDOMNode(point.node);
  if (
    target === null ||
    target.is(image) ||
    $getCaptionImage(target) !== null
  ) {
    return null;
  }
  const selection = $createRangeSelection();
  if ($isTextNode(target)) {
    const offset = Math.min(point.offset, target.getTextContentSize());
    selection.anchor.set(target.getKey(), offset, 'text');
    selection.focus.set(target.getKey(), offset, 'text');
  } else if ($isElementNode(target) && !target.isInline()) {
    const offset = Math.min(point.offset, target.getChildrenSize());
    selection.anchor.set(target.getKey(), offset, 'element');
    selection.focus.set(target.getKey(), offset, 'element');
  } else {
    const parent = target.getParent();
    if (parent === null) {
      return null;
    }
    const offset = target.getIndexWithinParent() + 1;
    selection.anchor.set(parent.getKey(), offset, 'element');
    selection.focus.set(parent.getKey(), offset, 'element');
  }
  return $normalizeSelection__EXPERIMENTAL(selection);
}

/** The image being dragged within this editor, if any */
function $getDraggedImage(
  editor: LexicalEditor,
  dataTransfer: DataTransfer,
): ImageNode | null {
  let data: Partial<ImageDragData> | null;
  try {
    data = JSON.parse(dataTransfer.getData(IMAGE_DRAG_TYPE));
  } catch {
    return null;
  }
  if (!data || data.editorKey !== editor.getKey() || !data.nodeKey) {
    return null;
  }
  const node = $getNodeByKey(data.nodeKey);
  return $isImageNode(node) ? node : null;
}

/**
 * Moves `image` to the caret position `point` (a DOM position in the editor).
 * Returns false, leaving the image where it is, when it can't go there.
 */
export function $moveImageToPoint(
  image: ImageNode,
  point: CaretPoint,
): boolean {
  const selection = $dropSelection(point, image);
  if (selection === null) {
    return false;
  }
  $setSelection(selection);
  $insertNodes([image]);
  $selectImage(image.getKey());
  return true;
}

/**
 * Moves an image within the editor by dragging it. Dragged elsewhere (another
 * editor, another app), it carries its URL and an `<img>` as HTML.
 */
function registerImageDragAndDrop(editor: LexicalEditor): () => void {
  return mergeRegister(
    editor.registerCommand(
      DRAGSTART_COMMAND,
      event => {
        const image = $getImageFromTarget(editor, event.target);
        const {dataTransfer} = event;
        const doc = editor.getRootElement()?.ownerDocument;
        if (!image || !dataTransfer || !doc || !editor.isEditable()) {
          return false;
        }
        const data: ImageDragData = {
          editorKey: editor.getKey(),
          nodeKey: image.getKey(),
        };
        const img = doc.createElement('img');
        img.src = image.getSrc();
        img.alt = image.getAltText();
        dataTransfer.clearData();
        dataTransfer.setData(IMAGE_DRAG_TYPE, JSON.stringify(data));
        dataTransfer.setData('text/html', img.outerHTML);
        dataTransfer.setData('text/uri-list', image.getSrc());
        dataTransfer.setData('text/plain', image.getSrc());
        dataTransfer.effectAllowed = 'copyMove';
        $selectImage(image.getKey());
        return true;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      DRAGOVER_COMMAND,
      event => {
        const {dataTransfer} = event;
        if (
          dataTransfer === null ||
          !dataTransfer.types.includes(IMAGE_DRAG_TYPE)
        ) {
          return false;
        }
        // Allow the drop; DROP_COMMAND does the move
        event.preventDefault();
        dataTransfer.dropEffect = 'move';
        return true;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      DROP_COMMAND,
      event => {
        const {dataTransfer} = event;
        const image = dataTransfer && $getDraggedImage(editor, dataTransfer);
        if (!image) {
          return false;
        }
        event.preventDefault();
        const point = caretFromPoint(editor, event.clientX, event.clientY);
        if (point !== null) {
          $moveImageToPoint(image, point);
        }
        return true;
      },
      COMMAND_PRIORITY_LOW,
    ),
  );
}

/** Click selection, caption keys, and moving images by drag and drop */
export function registerImageInteractions(editor: LexicalEditor): () => void {
  return mergeRegister(
    registerImageClick(editor),
    registerCaptionKeys(editor),
    registerImageDragAndDrop(editor),
  );
}
