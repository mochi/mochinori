---
title: '@mochinori/images'
---

# `@mochinori/images`

A full-featured image node for Lexical, modeled on the `ImageNode` in the
Lexical playground and packaged as a library.

:::info Status

This package is an early scaffold. `ImageNode`, `ImagesExtension`,
`INSERT_IMAGE_COMMAND` and uploads (`ImageUploadExtension`) work today.
Resizing and captions are next.

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

`width` and `height` are omitted when unknown. The node exports to `<img>`
HTML. HTML import goes through `ImagesImportExtension` only.

### `ImagesImportExtension`

Adds `ImageImportRule` to `@lexical/html`'s `DOMImportExtension`, so pasted
HTML and `$generateNodesFromDOM` turn `<img>` into `ImageNode`. It depends on
`ImagesExtension` and `CoreImportExtension`. Images whose `src` is a local
`file:///` path are skipped, because they can never load in the editor.
`ImageNode` has no legacy `importDOM`, so add this extension wherever images
should be imported from HTML.

### `ImageUploadExtension`

Inserts image files from paste, drag and drop, or a file dialog, and uploads
them in the background. Each image appears right away with a local `blob:`
URL, dimmed with a progress bar. When the upload finishes, the extension
preloads the uploaded image and only then swaps the node's `src` to it, so
the image never flickers. The swap is merged into the insertion's undo step.
A failed upload shows an error with a Retry button.

```ts
import {configExtension, defineExtension} from 'lexical';
import {
  createHttpImageUploader,
  ImageUploadExtension,
} from '@mochinori/images';

const AppExtension = defineExtension({
  dependencies: [
    configExtension(ImageUploadExtension, {
      upload: createHttpImageUploader({url: '/api/images'}),
    }),
  ],
  name: '@my-app/Editor',
});
```

| Config | Default | Description |
| --- | --- | --- |
| `disabled` | `false` | When `true`, files are not inserted or uploaded. |
| `upload` | `null` | `(file, {signal, onProgress}) => Promise<{src}>`. Without one, images keep their local URL. |
| `inlineDataUrlMaxLength` | `1024` | `data:` URLs up to this length stay inline in the document; longer ones are uploaded. `blob:` URLs are always uploaded. |
| `accept` | PNG, JPEG, GIF, WebP, AVIF | MIME types accepted. SVG is left out because it can carry script. |
| `maxFileSize` | 10 MB | Larger files are rejected. |
| `onReject` | `null` | Called with the file and `'type'` or `'size'` for each file that is not inserted. |

The output has signals `uploads` (state per local URL) and `pendingCount`,
and functions `openFileDialog()`, `retry(localSrc)` and `waitForUploads()`.
Await `waitForUploads()` before saving, so the saved JSON has no local URLs.
`INSERT_IMAGE_FILES_COMMAND` inserts a `File[]` directly.

### `createHttpImageUploader({url})`

An uploader that POSTs the file as the raw request body, with its type as
`Content-Type`, and reports upload progress. The server answers with JSON
`{"src": "..."}` (resolved against the response URL), or an error status
with `{"error": "..."}`. The demo site's Worker implements this endpoint on
R2, and deletes uploads after an hour.

### `$createImageNode(payload)` and `$isImageNode(node)`

Create an `ImageNode` from an `ImagePayload` (`src`, and optional `altText`,
`width` and `height`), and test whether a node is one.

## Roadmap

- Resizing with handles, keeping the aspect ratio
- Captions as nested editors
