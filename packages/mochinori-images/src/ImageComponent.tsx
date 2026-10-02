// Type-only, so this module does not import the extension and create a
// module cycle through ImageNode
import type {
  ImageUploadExtension,
  ImageUploadState,
} from './ImageUploadExtension.ts';
import type {NodeKey} from 'lexical';
import type {JSX} from 'react';

import {signal} from '@lexical/extension';
import {usePeerExtensionDependency} from '@lexical/react/useExtensionComponent';
import {useSignalValue} from '@lexical/react/useExtensionSignalValue';
import {useLexicalNodeSelection} from '@lexical/react/useLexicalNodeSelection';

export interface ImageComponentProps {
  altText: string;
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

export function ImageComponent({
  altText,
  height,
  nodeKey,
  src,
  width,
}: ImageComponentProps): JSX.Element {
  const [isSelected] = useLexicalNodeSelection(nodeKey);
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
    <span className="mochinori-image-frame" data-upload-status={upload?.status}>
      <img
        alt={altText}
        className={classNames.join(' ')}
        draggable="false"
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
          Upload failed.{' '}
          <button
            className="mochinori-image-retry"
            onClick={() => dep.output.retry(src)}
            type="button">
            Retry
          </button>
        </span>
      ) : null}
    </span>
  );
}
