// Type-only, so this module does not import the extension and create a
// module cycle through ImageNode
import type {
  ImageUploadExtension,
  ImageUploadState,
} from './ImageUploadExtension.ts';
import type {JSX} from 'react';

import {signal} from '@lexical/extension';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {usePeerExtensionDependency} from '@lexical/react/useExtensionComponent';
import {useSignalValue} from '@lexical/react/useExtensionSignalValue';
import {useLexicalEditable} from '@lexical/react/useLexicalEditable';
import {useLexicalNodeSelection} from '@lexical/react/useLexicalNodeSelection';
import {useLexicalSlotRef} from '@lexical/react/useLexicalSlotRef';
import {type LexicalEditor, type NodeKey} from 'lexical';
import {useCallback, useEffect, useRef, useState} from 'react';

import {
  $isImageCaptionEmpty,
  $setImageCaptionShown,
  IMAGE_CAPTION_SLOT,
} from './ImageCaption.ts';

export interface ImageComponentProps {
  altText: string;
  hasCaption: boolean;
  height: number | undefined;
  nodeKey: NodeKey;
  src: string;
  width: number | undefined;
}

const NO_UPLOADS = /* @__PURE__ */ signal<
  ReadonlyMap<string, ImageUploadState>
>(new Map());

function useImageUploadExtension() {
  return usePeerExtensionDependency<typeof ImageUploadExtension>(
    '@mochinori/images/ImageUpload',
  );
}

/** Whether the image's caption has no text, kept current as it is edited */
function useCaptionIsEmpty(editor: LexicalEditor, nodeKey: NodeKey): boolean {
  const [isEmpty, setIsEmpty] = useState(true);
  useEffect(() => {
    const check = () =>
      setIsEmpty(editor.read('latest', () => $isImageCaptionEmpty(nodeKey)));
    check();
    return editor.registerUpdateListener(check);
  }, [editor, nodeKey]);
  return isEmpty;
}

function ImageCaption({
  autoFocus,
  nodeKey,
  onFocus,
}: {
  autoFocus: boolean;
  nodeKey: NodeKey;
  onFocus: () => void;
}): JSX.Element {
  const [editor] = useLexicalComposerContext();
  const isEditable = useLexicalEditable();
  const slotRef = useLexicalSlotRef<HTMLSpanElement>(
    editor,
    nodeKey,
    IMAGE_CAPTION_SLOT,
  );
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const captionRef = useCallback(
    (element: HTMLSpanElement | null) => {
      wrapperRef.current = element;
      return slotRef(element);
    },
    [slotRef],
  );
  const isEmpty = useCaptionIsEmpty(editor, nodeKey);
  // A new caption gets the caret once its text is in the document; before
  // the slot is mounted here, the browser has nowhere to put it
  useEffect(() => {
    if (autoFocus) {
      onFocus(); // The caption is editable inside the image, which is not, so it is
      // focused on its own rather than through the editor's root
      wrapperRef.current
        ?.querySelector<HTMLElement>('[data-lexical-slot]')
        ?.focus({preventScroll: true});
      editor.update(() => $setImageCaptionShown(nodeKey, true));
    }
  }, [autoFocus, editor, nodeKey, onFocus]);
  return (
    <span className="mochinori-image-caption">
      <span className="mochinori-image-caption-slot" ref={captionRef} />
      {isEmpty && isEditable ? (
        <span
          aria-hidden="true"
          className="mochinori-image-caption-placeholder">
          Write a caption…
        </span>
      ) : null}
    </span>
  );
}

export function ImageComponent({
  altText,
  hasCaption,
  height,
  nodeKey,
  src,
  width,
}: ImageComponentProps): JSX.Element {
  const [editor] = useLexicalComposerContext();
  const isEditable = useLexicalEditable();
  const [isSelected] = useLexicalNodeSelection(nodeKey);
  const [focusCaption, setFocusCaption] = useState(false);
  const onCaptionFocus = useCallback(() => setFocusCaption(false), []);
  const dep = useImageUploadExtension();
  const upload = useSignalValue(dep ? dep.output.uploads : NO_UPLOADS).get(src);
  const classNames = ['mochinori-image'];
  if (isSelected) {
    classNames.push('focused');
  }
  if (upload && upload.status !== 'uploaded') {
    classNames.push(`mochinori-image--${upload.status}`);
  }
  return (
    <span
      className="mochinori-image-frame"
      data-selected={isSelected || undefined}
      data-upload-status={upload?.status}>
      {/* The image and what is drawn over it; the caption goes below */}
      <span className="mochinori-image-media">
        <img
          alt={altText}
          className={classNames.join(' ')}
          draggable={isEditable}
          height={height}
          src={src}
          width={width}
        />
        {upload?.status === 'uploading' ? (
          <span
            aria-label="Uploading image"
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={
              upload.progress === null
                ? undefined
                : Math.round(upload.progress * 100)
            }
            className="mochinori-image-progress"
            role="progressbar">
            <span
              className="mochinori-image-progress-bar"
              style={{
                width:
                  upload.progress === null
                    ? undefined
                    : `${Math.round(upload.progress * 100)}%`,
              }}
            />
          </span>
        ) : null}
        {upload?.status === 'error' && dep ? (
          <span className="mochinori-image-error" role="alert">
            {/* By name: importing ImageTooLargeError would create the cycle */}
            {upload.error instanceof Error &&
            upload.error.name === 'ImageTooLargeError' ? (
              'Image is too large to upload.'
            ) : (
              <>
                Upload failed.{' '}
                <button
                  className="mochinori-image-retry"
                  onClick={() => dep.output.retry(src)}
                  type="button">
                  Retry
                </button>
              </>
            )}
          </span>
        ) : null}
        {isSelected && isEditable ? (
          <button
            className="mochinori-image-caption-toggle"
            onClick={() => {
              setFocusCaption(!hasCaption);
              editor.update(() => $setImageCaptionShown(nodeKey, !hasCaption));
            }}
            // Keep the focus in the editor
            onMouseDown={event => event.preventDefault()}
            type="button">
            {hasCaption ? 'Remove caption' : 'Add caption'}
          </button>
        ) : null}
      </span>
      {hasCaption ? (
        <ImageCaption
          autoFocus={focusCaption}
          nodeKey={nodeKey}
          onFocus={onCaptionFocus}
        />
      ) : null}
    </span>
  );
}
