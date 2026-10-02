---
title: '@mochinori/images'
---

# `@mochinori/images`

A full-featured image node for Lexical, modeled on the `ImageNode` in the
Lexical playground and packaged as a library.

:::info Status

This package is an early scaffold. `ImageNode`, `ImagesExtension` and
`INSERT_IMAGE_COMMAND` work today. Upload, resizing and captions are next.

:::

[Try it in the demos](/demos#images).

## Usage

```ts
import {ImagesExtension, INSERT_IMAGE_COMMAND} from '@mochinori/images';

// Add ImagesExtension to your editor's dependencies, then:
editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
  altText: 'A mochi',
  src: 'https://example.com/mochi.png',
  width: 320,
  height: 240,
});
```

## API

### `ImagesExtension`

Registers `ImageNode` and handles `INSERT_IMAGE_COMMAND`.

| Config | Default | Description |
| --- | --- | --- |
| `disabled` | `false` | When `true`, `INSERT_IMAGE_COMMAND` is not handled. Also exposed as a signal on the extension's output. |

### `ImageNode`

An inline `DecoratorNode` rendered as an `<img>`. It serializes as:

```json
{
  "type": "image",
  "version": 1,
  "src": "https://example.com/mochi.png",
  "altText": "A mochi",
  "width": 320,
  "height": 240
}
```

`width` and `height` are omitted when unknown. The node imports from and
exports to `<img>` HTML.

### `$createImageNode(payload)` and `$isImageNode(node)`

Create an `ImageNode` from an `ImagePayload` (`src`, and optional `altText`,
`width` and `height`), and test whether a node is one.

## Roadmap

- Upload: a pluggable uploader, with a Cloudflare R2 backed default
- Resizing with handles, keeping the aspect ratio
- Captions as nested editors
- Drag and drop, and paste of image files
