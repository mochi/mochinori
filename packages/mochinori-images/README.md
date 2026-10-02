# `@mochinori/images`

A full-featured image node for [Lexical](https://lexical.dev) editors.

> **Status:** early scaffold. `ImageNode` and `ImagesExtension` work today;
> resizing, captions and upload are on the way.

## Install

```sh
npm install @mochinori/images lexical @lexical/extension @lexical/react react react-dom
```

`lexical` and `@lexical/*` are peer dependencies: your app provides exactly one
copy of Lexical.

## Usage

```tsx
import {ImagesExtension, INSERT_IMAGE_COMMAND} from '@mochinori/images';
import {LexicalExtensionComposer} from '@lexical/react/LexicalExtensionComposer';
import {defineExtension} from 'lexical';

const AppExtension = defineExtension({
  dependencies: [ImagesExtension],
  name: '@my-app/Editor',
});

// ...
editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
  altText: 'mochinori',
  src: '/img/mochinori-mark.svg',
});
```
