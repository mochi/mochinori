import type {NodeKey} from 'lexical';
import type {JSX} from 'react';

import {useLexicalNodeSelection} from '@lexical/react/useLexicalNodeSelection';

export interface ImageComponentProps {
  altText: string;
  height: number | undefined;
  nodeKey: NodeKey;
  src: string;
  width: number | undefined;
}

export function ImageComponent({
  altText,
  height,
  nodeKey,
  src,
  width,
}: ImageComponentProps): JSX.Element {
  const [isSelected] = useLexicalNodeSelection(nodeKey);
  return (
    <img
      alt={altText}
      className={isSelected ? 'mochinori-image focused' : 'mochinori-image'}
      draggable="false"
      height={height}
      src={src}
      width={width}
    />
  );
}
