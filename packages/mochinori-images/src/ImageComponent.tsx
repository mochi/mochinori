// Type-only, so this module does not import the extension and create a
// module cycle through ImageNode
import type {ImageNode} from './ImageNode.tsx';
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
import {$getNodeByKey, type LexicalEditor, type NodeKey} from 'lexical';
import {useCallback, useEffect, useId, useRef, useState} from 'react';

import {
  $isImageCaptionEmpty,
  $selectCaptionEnd,
  $selectImage,
  IMAGE_CAPTION_SLOT,
  SET_IMAGE_BLOCK_COMMAND,
  SET_IMAGE_CAPTION_COMMAND,
  takeCaptionFocus,
} from './ImageCaption.ts';

export interface ImageComponentProps {
  altText: string;
  hasCaption: boolean;
  height: number | undefined;
  /** True for a block image (a figure), false for an inline image */
  isBlock: boolean;
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

function ImageCaption({nodeKey}: {nodeKey: NodeKey}): JSX.Element {
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
    if (takeCaptionFocus(editor, nodeKey)) {
      // The caption is editable inside the image, which is not, so it is
      // focused on its own rather than through the editor's root
      wrapperRef.current
        ?.querySelector<HTMLElement>('[data-lexical-slot]')
        ?.focus({preventScroll: true});
      editor.update(() => $selectCaptionEnd(nodeKey));
    }
  }, [editor, nodeKey]);
  return (
    <figcaption className="mochinori-image-caption">
      <span className="mochinori-image-caption-slot" ref={captionRef} />
      {isEmpty && isEditable ? (
        <span
          aria-hidden="true"
          className="mochinori-image-caption-placeholder">
          Write a caption…
        </span>
      ) : null}
    </figcaption>
  );
}

/**
 * A form for the image's alt text. Enter or Save stores it, Escape cancels,
 * and either way the image is selected again.
 */
function AltTextEditor({
  altText,
  nodeKey,
  onClose,
}: {
  altText: string;
  nodeKey: NodeKey;
  onClose: () => void;
}): JSX.Element {
  const [editor] = useLexicalComposerContext();
  const [value, setValue] = useState(altText);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  // Leaving the form by focusing something else saves without taking the
  // focus back
  const close = (save: boolean, reselect = true) => {
    editor.update(() => {
      const image = $getNodeByKey<ImageNode>(nodeKey);
      if (image === null) {
        return;
      }
      if (save && image.getAltText() !== value.trim()) {
        image.setAltText(value.trim());
      }
      if (reselect) {
        $selectImage(nodeKey);
      }
    });
    if (reselect) {
      editor.focus();
    }
    onClose();
  };
  return (
    <form
      className="mochinori-image-alt-editor"
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          close(true, false);
        }
      }}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.preventDefault();
          close(false);
        }
      }}
      onSubmit={event => {
        event.preventDefault();
        close(true);
      }}>
      <label htmlFor={inputId}>Alt text</label>
      <input
        id={inputId}
        onChange={event => setValue(event.target.value)}
        placeholder="Describe the image"
        ref={inputRef}
        type="text"
        value={value}
      />
      <button type="submit">Save</button>
    </form>
  );
}

export function ImageComponent({
  altText,
  hasCaption,
  height,
  isBlock,
  nodeKey,
  src,
  width,
}: ImageComponentProps): JSX.Element {
  const [editor] = useLexicalComposerContext();
  const isEditable = useLexicalEditable();
  const [isSelected] = useLexicalNodeSelection(nodeKey);
  const [isEditingAltText, setEditingAltText] = useState(false);
  const dep = useImageUploadExtension();
  const upload = useSignalValue(dep ? dep.output.uploads : NO_UPLOADS).get(src);
  const classNames = ['mochinori-image'];
  if (isSelected) {
    classNames.push('focused');
  }
  if (upload && upload.status !== 'uploaded') {
    classNames.push(`mochinori-image--${upload.status}`);
  }
  // A block image is a figure, named by its caption for assistive
  // technology; an inline image is just an image in the text
  const Frame = isBlock ? 'figure' : 'span';
  const showTools = isSelected && isEditable;
  return (
    <Frame
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
        {showTools && !isEditingAltText ? (
          // Buttons keep the focus in the editor (onMouseDown)
          <span className="mochinori-image-tools">
            <button
              onClick={() => setEditingAltText(true)}
              onMouseDown={event => event.preventDefault()}
              type="button">
              Alt text
            </button>
            <button
              onClick={() =>
                editor.dispatchCommand(SET_IMAGE_CAPTION_COMMAND, {
                  caption: !hasCaption,
                  nodeKey,
                })
              }
              onMouseDown={event => event.preventDefault()}
              type="button">
              {hasCaption ? 'Remove caption' : 'Add caption'}
            </button>
            <button
              onClick={() =>
                editor.dispatchCommand(SET_IMAGE_BLOCK_COMMAND, {
                  block: !isBlock,
                  nodeKey,
                })
              }
              onMouseDown={event => event.preventDefault()}
              type="button">
              {isBlock ? 'Make inline' : 'Make block'}
            </button>
          </span>
        ) : null}
        {isEditable && isEditingAltText ? (
          <AltTextEditor
            altText={altText}
            nodeKey={nodeKey}
            onClose={() => setEditingAltText(false)}
          />
        ) : null}
      </span>
      {hasCaption ? <ImageCaption nodeKey={nodeKey} /> : null}
    </Frame>
  );
}
